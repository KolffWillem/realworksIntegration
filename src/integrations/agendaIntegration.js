const fetch = require('../utils/fetchClient');

async function createAgenda(authHeader, agendaData) {
  try {
    const response = await fetch('https://api.realworks.nl/agenda/v3', {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(agendaData),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = errorText;
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.foutmeldingen
          ? errorJson.foutmeldingen.join(', ')
          : errorText;
      } catch (parseError) {
        // Response is geen JSON
      }
      throw new Error(`Error creating agenda: ${response.statusText} - ${errorMessage}`);
    }

    const createAgendaData = await response.json();
    return createAgendaData;
  } catch (error) {
    console.error('Error in createAgenda:', error);
    throw error;
  }
}

async function updateAgenda(authHeader, agendaId, agendaData) {
  try {
    const response = await fetch(`https://api.realworks.nl/agenda/v3/${agendaId}`, {
      method: 'PUT',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(agendaData),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = errorText;
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.foutmeldingen
          ? errorJson.foutmeldingen.join(', ')
          : errorText;
      } catch (parseError) {
        // Response is geen JSON
      }
      throw new Error(`Error updating agenda: ${response.statusText} - ${errorMessage}`);
    }

    const updateAgendaData = await response.json();
    return updateAgendaData;
  } catch (error) {
    console.error('Error in updateAgenda:', error);
    throw error;
  }
}

async function updateAgendaV2(authHeader, agendaData) {
  try {
    const response = await fetch(`https://api.realworks.nl/agenda/v2`, {
      method: 'PUT',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(agendaData),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Error updating agenda: ${response.statusText} - ${errorText}`);
    }

    const updateAgendaData = await response.json();
    return updateAgendaData;
  } catch (error) {
    console.error('Error in updateAgendaV2:', error);
    throw error;
  }
}




module.exports = {
  createAgenda,
  updateAgenda,
  updateAgendaV2,
};