const fetch = require('../utils/fetchClient');

async function handleRelation(authHeader, relationData, method) {
  try {
    const url = `https://api.realworks.nl/relaties/v1`;
    const response = await fetch(url, {
      method: method,
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(relationData),
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
      throw new Error(`Error ${method === 'POST' ? 'creating' : 'updating'} relation: ${response.statusText} - ${errorMessage}`);
    }

    const relationDataResponse = await response.json();
    return relationDataResponse;
  } catch (error) {
    console.error(`Error in ${method === 'POST' ? 'createRelation' : 'updateRelation'}:`, error);
    throw error;
  }
}

async function createRelation(authHeader, relationData) {
  return handleRelation(authHeader, relationData, 'POST');
}

async function updateRelation(authHeader, relationData) {
  return handleRelation(authHeader, relationData, 'PUT');
}

module.exports = {
  createRelation,
  updateRelation,
};