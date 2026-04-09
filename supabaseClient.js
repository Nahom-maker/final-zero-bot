import { createClient } from '@supabase/supabase-js';
import config from './config.js';

const supabase = createClient(
  config.supabase.url,
  config.supabase.anonKey // 🔥 correct for backend bot
);

export default supabase;
