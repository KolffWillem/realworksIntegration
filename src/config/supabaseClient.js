const { createClient } = require('@supabase/supabase-js');
const { supabaseUrl, supabaseServiceRoleKey } = require('./index');

const supabaseClient = createClient(supabaseUrl, supabaseServiceRoleKey);

module.exports = supabaseClient;