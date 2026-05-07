#!/usr/bin/env node

/**
 * Apply migration 006 to create the monitoring_jobs table
 * Run this once to set up the database for persistent job tracking
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables are required');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function applyMigration() {
  try {
    console.log('[MIGRATION] Reading migration file...');
    const sql = fs.readFileSync('./migrations/006_add_monitoring_jobs_table.sql', 'utf8');

    console.log('[MIGRATION] Applying migration 006...');
    const { error } = await supabase.rpc('exec_sql', { sql });

    if (error) {
      console.error('[MIGRATION] Error:', error);
      process.exit(1);
    }

    console.log('[MIGRATION] ✓ Migration 006 applied successfully');
    console.log('[MIGRATION] monitoring_jobs table is now available');
  } catch (error) {
    console.error('[MIGRATION] Fatal error:', error);
    process.exit(1);
  }
}

applyMigration();
