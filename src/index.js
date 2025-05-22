const express = require('express');
const app = express();
const { port } = require('./config');
const bodyParser = require('body-parser');
const getAuthHeaderAgenda = require('./utils/getAuthHeaderAgenda');
const getAuthHeaderRelation = require('./utils/getAuthHeaderRelation');
const getAfdelingscode = require('./utils/getAfdelingscode');	
const getBedrijfscode = require('./utils/getBedrijfscode');
const { createAgenda, updateAgenda } = require('./integrations/agendaIntegration');
const { createRelation, updateRelation } = require('./integrations/relationIntegration');
const syncRealwork = require('../cronjob/sync-realworks-data');

// ip 172.235.181.143

app.use(bodyParser.json());

app.post('/createAgenda', async (req, res) => {
  const { 
    firmId, 
    agendaData, 
    supabaseKey, 
    supabaseUrl 
  } = req.body;

  try {
    console.log(firmId, supabaseUrl, supabaseKey)
    const { authHeaderAgenda } = await getAuthHeaderAgenda(firmId, supabaseUrl, supabaseKey);
    const agendaResult = await createAgenda(authHeaderAgenda, agendaData);

    res.status(200).json({ 
      message: 'Success', 
      data: agendaResult 
    });
  } catch (error) {
    console.error('Error in /createAgenda:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/createRelation', async (req, res) => {
  const { firmId, email, companyName, firstName, lastName, mobilePhone, accountManager, type = "PARTICULIER", supabaseUrl, supabaseKey, huisnummer, huisnummertoevoeging, postcode, straat, woonplaats } = req.body;

  try {
    const { authHeaderRelation } = await getAuthHeaderRelation(firmId, supabaseUrl, supabaseKey);
    const { afdelingscode } = await getAfdelingscode(firmId, supabaseUrl, supabaseKey);

    const newRelationBody = {
      accountmanager: accountManager,
      afdelingscode: afdelingscode,
      email: email,
      bedrijfsnaam: companyName,
      achternaam: lastName,
      roepnaam: firstName,
      mobielTelefoonnummer: mobilePhone,
      relatiesoort: type,
      huisnummer: huisnummer,
      huisnummertoevoeging: huisnummertoevoeging,
      postcode: postcode,
      straat: straat,
      woonplaats: woonplaats,
    };

    console.log("newRelationBody", newRelationBody)

    const relationResult = await createRelation(authHeaderRelation, newRelationBody);
    res.status(200).json({ message: 'Success', data: relationResult });
  } catch (error) {
    console.error('Error in /createRelation:', error);
    res.status(500).json({ error: error.message });
  }
});

app.put('/updateAgenda/:agendaId', async (req, res) => {
  const { agendaId } = req.params;
  const { firmId, agendaData, supabaseUrl, supabaseKey } = req.body;

  try {
    const formattedSupabaseUrl = supabaseUrl?.endsWith('/') 
      ? supabaseUrl 
      : `${supabaseUrl}/`;
    const { authHeaderAgenda } = await getAuthHeaderAgenda(firmId, formattedSupabaseUrl, supabaseKey);

    const updateResult = await updateAgenda(authHeaderAgenda, agendaId, agendaData);
    res.status(200).json({ message: 'Success', data: updateResult });
  } catch (error) {
    console.error('Error in /updateAgenda:', error);
    res.status(500).json({ error: error.message });
  }
});

app.put('/updateRelation', async (req, res) => {
  const { firmId, email, companyName, firstName, lastName, mobilePhone, accountManager, type = "PARTICULIER", supabaseUrl, supabaseKey, street, houseNumber, houseNumberAddition, postalCode, city, relationId } = req.body;

  try {
    const { authHeaderRelation } = await getAuthHeaderRelation(firmId, supabaseUrl, supabaseKey);
    const { afdelingscode } = await getAfdelingscode(firmId, supabaseUrl, supabaseKey);

    const updateRelationBody = {
      accountmanager: accountManager,
      afdelingscode: afdelingscode,
      email: email,
      bedrijfsnaam: companyName,
      achternaam: lastName,
      roepnaam: firstName,
      mobielTelefoonnummer: mobilePhone,
      relatiesoort: type,
      straat: street,
      huisnummer: houseNumber,
      huisnummertoevoeging: houseNumberAddition,
      postcode: postalCode,
      woonplaats: city,
      id: relationId,
    };

    console.log("updateRelationBody", updateRelationBody)	

    const updateResult = await updateRelation(authHeaderRelation,  updateRelationBody);
    res.status(200).json({ message: 'Success', data: updateResult });
  } catch (error) {
    console.error('Error in /updateRelation:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/getAgendaTypes/:firmId', async (req, res) => {
  const { firmId } = req.params;
  const { supabaseUrl, supabaseKey } = req.query;

  try {
    const formattedSupabaseUrl = supabaseUrl?.endsWith('/') 
      ? supabaseUrl 
      : `${supabaseUrl}/`;
    const { authHeaderAgenda } = await getAuthHeaderAgenda(firmId, formattedSupabaseUrl, supabaseKey);
    const { afdelingscode } = await getAfdelingscode(firmId, supabaseUrl, supabaseKey);

    const response = await fetch(`https://api.realworks.nl/agenda/v1/types/${afdelingscode}`, {
      method: 'GET',
      headers: {
        'Authorization': authHeaderAgenda,
      },
      redirect: 'follow'
    });

    if (!response.ok) {
      console.log("response", response.status)
      throw new Error(`API responded with status: ${response.status}`);
    }

    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      console.log("contentType", contentType)
      throw new Error(`Expected JSON response but got ${contentType}`);
    }

    const result = await response.json();
    res.status(200).json(result);
  } catch (error) {
    console.error('Error in /getAgendaTypes:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/getAgendaStatussen/:firmId', async (req, res) => {
  const { firmId } = req.params;
  const { supabaseUrl, supabaseKey } = req.query;

  try {
    const formattedSupabaseUrl = supabaseUrl?.endsWith('/') 
      ? supabaseUrl 
      : `${supabaseUrl}/`;
    const { authHeaderAgenda } = await getAuthHeaderAgenda(firmId, formattedSupabaseUrl, supabaseKey);
    const { afdelingscode } = await getAfdelingscode(firmId, supabaseUrl, supabaseKey);

    const response = await fetch(`https://api.realworks.nl/agenda/v1/statussen/${afdelingscode}`, {
      method: 'GET',
      headers: {
        'Authorization': authHeaderAgenda,
      },
      redirect: 'follow'
    });
    const result = await response.json();

    // ma
    res.status(200).send(result);
  } catch (error) {
    console.error(error);
    res.status(500).send('Error fetching agenda statussen.');
  }
});


app.get('/getKenmerken/:firmId', async (req, res) => {
  const { firmId } = req.params;
  const { supabaseUrl, supabaseKey } = req.query;

  try {
    const { authHeaderRelation } = await getAuthHeaderRelation(firmId, supabaseUrl, supabaseKey);
    const { bedrijfscode } = await getBedrijfscode(firmId, supabaseUrl, supabaseKey);

    const response = await fetch(`https://api.realworks.nl/relaties/v1/kenmerken?bedrijfscode=${bedrijfscode}`, {
      method: 'GET',
      headers: {
        'Authorization': authHeaderRelation,
      },
    });

    const result = await response.json();
    res.status(200).json(result);
  } catch (error) {
    console.error('Error in /getKenmerken:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/getMedewerkers/:firmId', async (req, res) => {
  const { firmId } = req.params;
  const { supabaseUrl, supabaseKey } = req.query;

  try {
    const { authHeaderRelation } = await getAuthHeaderRelation(firmId, supabaseUrl, supabaseKey);

    const response = await fetch('https://api.realworks.nl/relaties/v1/medewerker', {
      method: 'GET',
      headers: {
        'Authorization': authHeaderRelation,
      },
    });

    if (!response.ok) {
      throw new Error(`Error fetching relations: ${response.statusText}`);
    }

    const relations = await response.json();
    res.status(200).json(relations);
  } catch (error) {
    console.error('Error in /getRelations:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/getRelations/:firmId', async (req, res) => {
  const { firmId } = req.params;
  const { supabaseUrl, supabaseKey, vanaf, aantal = 100 } = req.query;

  try {
    const { authHeaderRelation } = await getAuthHeaderRelation(firmId, supabaseUrl, supabaseKey);

    const response = await fetch(`https://api.realworks.nl/relaties/v1?vanaf=${vanaf}&aantal=${aantal}`, {
      method: 'GET',
      headers: {
        'Authorization': authHeaderRelation,
      },
    });

    const relations = await response.json();
    console.log("response length", relations.resultaten?.length);
    res.status(200).json(relations);
  } catch (error) {
    console.error('Error in /getRelations:', error);
    res.status(500).json({ error: error.message });
  }
})


app.get("/getAfdelingAgenda/:firmId", async (req, res) => {
  const { firmId } = req.params;
  const {
    supabaseUrl,
    supabaseKey,
    begintijdTot,
    begintijdVanaf,
    agendastatus,
    agendatypes,
    actief,
    aantal,
    vanaf,
  } = req.query;

  try {
    const formattedSupabaseUrl = supabaseUrl?.endsWith("/")
      ? supabaseUrl
      : `${supabaseUrl}/`;

    // 1. Retrieve authentication header
    const { authHeaderAgenda } = await getAuthHeaderAgenda(
      firmId,
      formattedSupabaseUrl,
      supabaseKey
    );

    const { afdelingscode } = await getAfdelingscode(
      firmId,
      supabaseUrl,
      supabaseKey
    );

    // 2. Build query params using the provided fields
    // If any field is optional, you may want to conditionally add it
    const queryParams = new URLSearchParams();
    if (aantal) {
      queryParams.append("aantal", aantal);
    }
    if (vanaf) {
      queryParams.append("vanaf", vanaf);
    }

    if (begintijdTot) {
      queryParams.append("begintijdTot", begintijdTot);
    }
    if (begintijdVanaf) {
      queryParams.append("begintijdVanaf", begintijdVanaf);
    }
    if (agendastatus) {
      queryParams.append("agendastatus", agendastatus);
    }
    if (agendatypes) {
      queryParams.append("agendatypes", agendatypes);
    }
    if (actief) {
      queryParams.append("actief", actief);
    }

    // 3. Call the RealWorks endpoint
    const response = await fetch(
      `https://api.realworks.nl/agenda/v3/afdeling/${afdelingscode}?${queryParams}`,
      {
        method: "GET",
        headers: {
          Authorization: authHeaderAgenda,
        },
      }
    );

    // 4. Parse the response
    if (!response.ok) {
      // Something went wrong in the RealWorks call
      const errorText = await response.text();
      return res.status(response.status).json({ error: errorText });
    }

    const data = await response.json();

    // 5. Send data back to the client
    res.status(200).json(data);
  } catch (error) {
    console.error("[Error in /getAfdelingAgenda]:", error);
    res.status(500).json({ error: "An unexpected error occurred" });
  }
});

// Add new endpoint for manual sync
app.post('/sync-realworks', async (req, res) => {
  console.log("🔄 Starting manual sync at", new Date().toISOString());
  try {
    await syncRealwork();
    console.log("✅ Manual sync completed at", new Date().toISOString());
    res.status(200).json({ message: 'Sync completed successfully' });
  } catch (error) {
    console.error("❌ Manual sync failed:", error);
    res.status(500).json({ error: error.message });
  }
});

// make a hellow world endpoint
app.get('/hello', (req, res) => {
  res.send('Hello World');
});

app.listen(port, () => {
  console.log(`Server is running on poort ${port}`);
});


