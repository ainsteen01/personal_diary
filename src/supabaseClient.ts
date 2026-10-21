import { createClient } from '@supabase/supabase-js'

const supabaseUrl = "https://wrfgwpemidnmghhntljn.supabase.co"
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndyZmd3cGVtaWRubWdoaG50bGpuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI0OTA5MDgsImV4cCI6MjEwODA2NjkwOH0.E1zs6wicKdRO5vmOJebMniw_on2OK72etxqqiu6gyPI"

export const supabase = createClient(supabaseUrl, supabaseAnonKey)