import { createClient } from '@supabase/supabase-js';
import config from './config.js';

const supabase = createClient(
  config.supabase.url,
  config.supabase.serviceRoleKey // 🔥 correct for backend bot
);

export default supabase;
