#!/bin/bash
echo "Exporting n8n workflows..."
mkdir -p ./n8n_workflows
n8n export:workflow --all --output=./n8n_workflows/workflows.json
echo "Workflows exported successfully!"
