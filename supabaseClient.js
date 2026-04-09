// ─── Supabase Client ─────────────────────────────────────────────────────────
// Single shared instance of the Supabase client.

import { createClient } from '@supabase/supabase-js';
import config from './config.js';

const supabase = createClient(config.supabase.url, config.supabase.anonKey);

export default supabase;
