const decrypt = require('./decrypt');
const { encryptionKey } = require('../config');
const { createClient } = require('@supabase/supabase-js');

async function getAuthHeaderRelation(firmId, supabaseUrl, supabaseKey) {


  // if the supabase url and key are not provided, use the ones from the config
  if (!supabaseUrl || !supabaseKey) {
    const {
      supabaseUrl: configSupabaseUrl,
      supabaseServiceRoleKey: configSupabaseServiceRoleKey
    } = require('../config');
    supabaseUrl = configSupabaseUrl;
    supabaseKey = configSupabaseServiceRoleKey;
  }

  const supabaseClient = createClient(supabaseUrl, supabaseKey);
  
  let authHeaderRelation;
  console.log('Attempting to fetch integration_instances for firm_id:', firmId);
  
  const { data, error } = await supabaseClient
    .from('integration_instances')
    .select('settings')
    .eq('firm_id', firmId)
    .single();

  if (error) {
    console.error('Supabase error details:', {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code
    });
    throw new Error(`Error fetching settings: ${error.message}`);
  }

  if (!data) {
    console.error('No data found for firm_id:', firmId);
    throw new Error('No integration instance found for this firm');
  }



  const settings = data.settings;
  const decryptedApiKey = decrypt(settings.encrypted_token_relation, encryptionKey);
  authHeaderRelation = `${decryptedApiKey}`;

  return { authHeaderRelation };
}

module.exports = getAuthHeaderRelation;
