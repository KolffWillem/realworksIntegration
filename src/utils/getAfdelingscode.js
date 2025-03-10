const { createClient } = require('@supabase/supabase-js');

async function getAfdelingscode(firmId, supabaseUrl, supabaseKey) {
  // If supabase credentials are not provided, use config values
  if (!supabaseUrl || !supabaseKey) {
    const {
      supabaseUrl: configSupabaseUrl,
      supabaseServiceRoleKey: configSupabaseServiceRoleKey
    } = require('../config');
    supabaseUrl = configSupabaseUrl;
    supabaseKey = configSupabaseServiceRoleKey;
  }

  const supabaseClient = createClient(supabaseUrl, supabaseKey);

  const { data, error } = await supabaseClient
    .from('external_attributes')
    .select('attribute_value')
    .eq('entity_id', firmId)
    .eq('entity_type', 'firm')
    .eq('attribute_name', 'afdelingscode')
    .single();

  if (error) throw new Error('Error fetching afdelingscode');
  if (!data) throw new Error('Afdelingscode not found for this firm');

  return { afdelingscode: data.attribute_value };
}

module.exports = getAfdelingscode;
