import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://sofowqilxmplbfownnqh.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNvZm93cWlseG1wbGJmb3dubnFoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIyMzA1MDcsImV4cCI6MjEwNzgwNjUwN30.18rDg6X-3eJx1N9jHgbPCdZhYt5m23OiaL9DBQ73qE4';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);