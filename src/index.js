const express = require('express');
const app = express();
const { port } = require('./config');
const bodyParser = require('body-parser');
const getAuthHeaderAgenda = require('./utils/getAuthHeaderAgenda');
const getAuthHeaderRelation = require('./utils/getAuthHeaderRelation');
const getAfdelingscode = require('./utils/getAfdelingscode');
const { createAgenda, updateAgenda } = require('./integrations/agendaIntegration');
const { createRelation, updateRelation } = require('./integrations/relationIntegration');



app.use(bodyParser.json());

app.post('/createAgenda', async (req, res) => {

    const { firmId, accountManager, email, companyName, firstName, lastName, mobilePhone, type = "PARTICULIER", agendaData, supabaseKey, supabaseUrl } = req.body;

  try {
    const { authHeaderAgenda } = await getAuthHeaderAgenda(firmId, supabaseUrl, supabaseKey);
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
    };

    const relationResult = await createRelation(authHeaderRelation, newRelationBody);
    const relationId = relationResult.relatieId;
    if (!relationId) throw new Error('Failed to obtain relationId');

    agendaData.relatieId = relationId;

    const agendaResult = await createAgenda(authHeaderAgenda, agendaData);
    res.status(200).json({ message: 'Success', data: { agendaResult, relationId } });
  } catch (error) {
    console.error('Error in  /createAgenda:', error);
    res.status(500).json({ error: error.message });
  }
});

app.put('/updateAgenda/:agendaId', async (req, res) => {
  const { agendaId } = req.params;
  const { firmId, agendaData, supabaseUrl, supabaseKey } = req.body;

  try {
    const { authHeaderAgenda } = await getAuthHeaderAgenda(firmId, supabaseUrl, supabaseKey);

    const updateResult = await updateAgenda(authHeaderAgenda, agendaId, agendaData);
    res.status(200).json({ message: 'Success', data: updateResult });
  } catch (error) {
    console.error('Error in /updateAgenda:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/createRelation', async (req, res) => {
  const { firmId, email, companyName, firstName, lastName, mobilePhone, accountManager, type = "PARTICULIER", supabaseUrl, supabaseKey } = req.body;

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
    };

    const relationResult = await createRelation(authHeaderRelation, newRelationBody);
    res.status(200).json({ message: 'Success', data: relationResult });
  } catch (error) {
    console.error('Error in /createRelation:', error);
    res.status(500).json({ error: error.message });
  }
});

app.put('/updateRelation', async (req, res) => {
  const { firmId, email, companyName, firstName, lastName, mobilePhone, accountManager, type = "PARTICULIER", supabaseUrl, supabaseKey } = req.body;

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
    };

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
    const { authHeaderAgenda } = await getAuthHeaderAgenda(firmId, supabaseUrl, supabaseKey);
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
    const { authHeaderAgenda } = await getAuthHeaderAgenda(firmId, supabaseUrl, supabaseKey);
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

// make a hellow world endpoint
app.get('/hello', (req, res) => {
  res.send('Hello World');
});

app.listen(port, () => {
  console.log(`Server is running on poort ${port}`);
});
