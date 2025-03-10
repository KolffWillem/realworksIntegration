
const { createRelation } = require('../src/integrations/relationIntegration');
const getAuthHeader = require('../src/utils/getAuthHeader');

(async () => {
  const firmId = 'your-firm-id'; // Vervang door je eigen firmId
  const relationData = {
    // Vul met testgegevens volgens de API-specificaties
  };

  try {
    const { authHeader } = await getAuthHeader(firmId);
    const result = await createRelation(authHeader, relationData);
    console.log('Create Relation Result:', result);
  } catch (error) {
    console.error('Error testing createRelation:', error);
  }
})();