// api/sync.js

// Die exakt gleiche ISO-Länderliste aus deiner index.html zur fehlerfreien Zuordnung
const ISO = {
  "Mexico":"mx","Mexiko":"mx","South Africa":"za","Südafrika":"za","Brazil":"br","Brasilien":"br",
  "Morocco":"ma","Marokko":"ma","Netherlands":"nl","Niederlande":"nl","Japan":"jp","Qatar":"qa","Katar":"qa",
  "Switzerland":"ch","Schweiz":"ch","Canada":"ca","Kanada":"ca","USA":"us","United States":"us",
  "Germany":"de","Deutschland":"de","France":"fr","Frankreich":"fr","Spain":"es","Spanien":"es",
  "England":"gb-eng","Scotland":"gb-sct","Wales":"gb-wls","Argentina":"ar","Argentinien":"ar",
  "Portugal":"pt","Belgium":"be","Belgien":"be","Croatia":"hr","Kroatien":"hr","Italy":"it","Italien":"it",
  "South Korea":"kr","Südkorea":"kr","Korea Republic":"kr","Ecuador":"ec","Curaçao":"cw","Curacao":"cw",
  "Ivory Coast":"ci","Elfenbeinküste":"ci","Côte d'Ivoire":"ci","Norway":"no","Norwegen":"no",
  "Senegal":"sn","Czechia":"cz","Czech Republic":"cz","Tschechien":"cz","Bosnia-Herzegovina":"ba","Bosnien-Herzegowina":"ba",
  "Paraguay":"py","Uruguay":"uy","Colombia":"co","Kolumbien":"co","Austria":"at","Österreich":"at",
  "Australia":"au","Iran":"ir","Saudi Arabia":"sa","Ghana":"gh","Nigeria":"ng","Cameroon":"cm","Kamerun":"cm",
  "Algeria":"dz","Algerien":"dz","Tunisia":"tn","Tunesien":"tn","Egypt":"eg","Ägypten":"eg","Mali":"ml",
  "Poland":"pl","Polen":"pl","Denmark":"dk","Dänemark":"dk","Sweden":"se","Schweden":"se","Serbia":"rs","Serbien":"rs",
  "Turkey":"tr","Türkiye":"tr","Türkei":"tr","Greece":"gr","Griechenland":"gr","Ukraine":"ua","Hungary":"hu","Ungarn":"hu",
  "Romania":"ro","Rumänien":"ro","New Zealand":"nz","Neuseeland":"nz","Costa Rica":"cr","Panama":"pa",
  "Honduras":"hn","Jamaica":"jm","Jamaika":"jm","Peru":"pe","Chile":"cl","Venezuela":"ve","Bolivia":"bo","Bolivien":"bo",
  "Cape Verde":"cv","Kap Verde":"cv","DR Congo":"cd","Haiti":"ht","Uzbekistan":"uz","Usbekistan":"uz","Jordan":"jo","Jordanien":"jo",
  "Iraq":"iq","Irak":"iq","UAE":"ae","United Arab Emirates":"ae"
};

const SUPABASE_URL = "https://dgjfydzjgokzigklgchj.supabase.co";
const SUPABASE_KEY = "sb_publishable_mRkwbCEvlRcQL8wk3YSJ4g_6ceY3yUz";

// Hilfsfunktion, um Länder zu ISO-Codes aufzulösen
function getISO(teamName) {
  if (!teamName) return null;
  return ISO[teamName.trim()] || null;
}

export default async function handler(req, res) {
  try {
    // 1. Offene Spiele aus Supabase abrufen
    const dbResponse = await fetch(`${SUPABASE_URL}/rest/v1/matches?finished=eq.false`, {
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${SUPABASE_KEY}`
      }
    });

    if (!dbResponse.ok) {
      throw new Error(`Supabase-Verbindung fehlgeschlagen: ${dbResponse.statusText}`);
    }

    const dbMatches = await dbResponse.json();

    if (!dbMatches.length) {
      return res.status(200).json({ success: true, message: "Keine offenen Spiele zum Synchronisieren." });
    }

    // 2. Live-Ergebnisse von der Weltcup-API holen
    const apiResponse = await fetch("https://worldcupjson.net/matches");
    if (!apiResponse.ok) {
      throw new Error(`Verbindung zur Live-Ergebnis-API fehlgeschlagen: ${apiResponse.statusText}`);
    }
    const apiMatches = await apiResponse.json();

    let updatedCount = 0;

    // 3. Spiele abgleichen und Datenbank aktualisieren
    for (const dbM of dbMatches) {
      const dbHomeISO = getISO(dbM.home);
      const dbAwayISO = getISO(dbM.away);

      if (!dbHomeISO || !dbAwayISO) continue;

      // Suche das passende Spiel im API-Datensatz über die ISO-Codes
      const apiM = apiMatches.find(m => {
        const apiHomeISO = getISO(m.home_team_country || m.home_team?.name);
        const apiAwayISO = getISO(m.away_team_country || m.away_team?.name);
        return (dbHomeISO === apiHomeISO && dbAwayISO === apiAwayISO);
      });

      // Falls das Spiel in der API existiert und beendet ist
      if (apiM && apiM.status === "completed") {
        const homeScore = apiM.home_team_score ?? apiM.home_team?.goals;
        const awayScore = apiM.away_team_score ?? apiM.away_team?.goals;

        if (homeScore != null && awayScore != null) {
          // Update in Supabase einspielen
          const updateRes = await fetch(`${SUPABASE_URL}/rest/v1/matches?id=eq.${dbM.id}`, {
            method: "PATCH",
            headers: {
              "apikey": SUPABASE_KEY,
              "Authorization": `Bearer ${SUPABASE_KEY}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              home_score: Number(homeScore),
              away_score: Number(awayScore),
              finished: true,
              locked: true
            })
          });

          if (updateRes.ok) {
            updatedCount++;
          }
        }
      }
    }

    return res.status(200).json({ 
      success: true, 
      message: `Synchronisierung abgeschlossen. ${updatedCount} Spiele wurden aktualisiert.` 
    });

  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}
