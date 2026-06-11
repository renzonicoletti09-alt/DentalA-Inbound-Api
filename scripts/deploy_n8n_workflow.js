const fs = require('fs');
require('dotenv').config();

const API_KEY = process.env.DENTALA_N8N_API_KEY;
const N8N_URL = "https://n8n.dental-a.com/api/v1/workflows";

async function deployWorkflow() {
    try {
        const workflowData = JSON.parse(fs.readFileSync('n8n_motor_inbound_native.json', 'utf8'));
        
        const response = await fetch(N8N_URL, {
            method: 'POST',
            headers: {
                'X-N8N-API-KEY': API_KEY,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(workflowData)
        });

        const result = await response.json();
        
        if (response.ok) {
            console.log("Success! Workflow created with ID:", result.id);
        } else {
            console.error("Failed to deploy workflow:", result);
        }
    } catch (err) {
        console.error("Error deploying workflow:", err.message);
    }
}

deployWorkflow();
