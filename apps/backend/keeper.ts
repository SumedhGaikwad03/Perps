import axios from "axios"; 


const BACKEND_URL = "http://localhost:3000/api/v1/engine/liquidations";

const POLL_INTERVALS_MS = 1000 ; 



// LETS NOW  congigure auth token 

const AUTH_TOKEN = process.env.ADMIN_SECRET ||  ".." ;

async function runLiquadationKeeper(){

    while(true){


        try {

            
        }
    }
}


