import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';


const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);



function runPythonScript(scriptPath, args = []) {
    return new Promise((resolve, reject) => {
        const pythonProcess = spawn('python3', [scriptPath, ...args]);
        let output = '';
        let errorOutput = '';

        pythonProcess.stdout.on('data', (data) => {
            output += data.toString();
        });

        pythonProcess.stderr.on('data', (data) => {
            errorOutput += data.toString();
        });

        pythonProcess.on('close', (code) => {
            if (code !== 0) {
                reject(new Error(`Python script exited with code ${code}: ${errorOutput}`));
            } else {
                try {
                    resolve(JSON.parse(output));
                } catch (e) {
                    reject(new Error(`Failed to parse Python output: ${e.message}`));
                }
            }
        });
    });
}

export async function buildSchedule(params) {
    const scriptPath = path.join(__dirname, '../../bruinbot_scripts/scheduler/scheduler.py');
    
    // Set environment variables from params
    process.env.SUPABASE_URL = params.supabaseUrl;
    process.env.SUPABASE_ANON_KEY = params.supabaseKey;
    
    // Set transcript in environment
    process.env.TRANSCRIPT = JSON.stringify(params.transcript || {});
    
    try {
        const result = await runPythonScript(scriptPath);
        return result;
    } catch (error) {
        console.error('Error running scheduler script:', error);
        throw error;
    }
}

export async function getElectiveOptions(params) {
    const scriptPath = path.join(__dirname, '../../bruinbot_scripts/scheduler/get_elective_options.py');
    
    // Set environment variables from params
    process.env.SUPABASE_URL = params.supabaseUrl;
    process.env.SUPABASE_ANON_KEY = params.supabaseKey;
    
    // Set schedule and transcript in environment
    process.env.SCHEDULE = JSON.stringify(params.schedule || {});
    process.env.TRANSCRIPT = JSON.stringify(params.transcript || {});
    
    try {
        const result = await runPythonScript(scriptPath);
        return result;
    } catch (error) {
        console.error('Error running get_elective_options script:', error);
        throw error;
    }
}
