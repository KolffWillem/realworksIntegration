const decrypt = require('./decrypt');
const { encryptionKey } = require('../config');
const { createClient } = require('@supabase/supabase-js');

async function getAuthHeaderAgenda(firmId, supabaseUrl, supabaseKey) {
  console.log('=== getAuthHeaderAgenda Debug Logs ===');
  console.log('Input params:', { firmId, supabaseUrl, supabaseKey });

  if (!supabaseUrl || !supabaseKey) {
    const {
      supabaseUrl: configSupabaseUrl,
      supabaseServiceRoleKey: configSupabaseServiceRoleKey
    } = require('../config');
    supabaseUrl = configSupabaseUrl;
    supabaseKey = configSupabaseServiceRoleKey;
    console.log('Using config values:', { supabaseUrl, supabaseKey });
  }

  const supabaseClient = createClient(supabaseUrl, supabaseKey);
  console.log('Supabase client created');

  

  try {
    const { data, error } = await supabaseClient
      .from('integration_instances')
      .select('settings')
      .eq('firm_id', firmId)
      .single();

    console.log('Supabase query result:', { data, error });

    if (error) throw new Error('Error fetching settings');

    const settings = data.settings;
    const decryptedApiKey = decrypt(settings.encrypted_token_agenda, encryptionKey);
    authHeaderAgenda = `${decryptedApiKey}`;

    console.log('Auth header generated successfully');
    return { authHeaderAgenda };
  } catch (error) {
    console.error('Error in getAuthHeaderAgenda:', error);
    throw error;
  }
}

module.exports = getAuthHeaderAgenda;
