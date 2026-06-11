#!/bin/bash
echo "Deploying database schema to Supabase..."
supabase db push
echo "Migration complete!"
