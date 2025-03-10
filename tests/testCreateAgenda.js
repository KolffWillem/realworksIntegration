
const { createAgenda } = require('../src/integrations/agendaIntegration');
const getAuthHeader = require('../src/utils/getAuthHeader');

(async () => {
  const firmId = 'your-firm-id'; // Vervang door je eigen firmId
  const agendaData = {
    // Vul met testgegevens volgens de API-specificaties
  };

  try {
    const { authHeader } = await getAuthHeader(firmId);
    const result = await createAgenda(authHeader, agendaData);
    console.log('Create Agenda Result:', result);
  } catch (error) {
    console.error('Error testing createAgenda:', error);
  }
})();