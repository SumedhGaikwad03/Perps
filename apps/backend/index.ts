
import express, { response } from 'express';
import { prisma } from 'db'; // or your custom db import
import jwt from "jsonwebtoken";

import {authmiddleware} from "./authMiddleware";

const app = express();

app.use(express.json()); // Essential for parsing JSON bodies in POST requests

app.post('/api/v1/users', async (req, res) => {

    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: "Username  and password are required" });
        }



        const response = await prisma.user.create({
            data: {
                username: username,
                password: password
            }

        })

        res.status(201).json({

            id: response.id
        })
    }

    catch (e) {
        console.error(e);

                res.status(500).json({ error: "Internal Server Error", details: String(e) });

    }




})

app.post('/api/v1/login' , async (req , res) => {

    try {

        const {username , password} = req.body; 


        if(!username || !password){

            return res.status(400).json({error : "Username and password are required"});

        }

        const response =await prisma.user.findFirst({

            where :{
                username : username ,
                password : password 
            }
        })

        if(!response){

            console.log("Invalid credentials for user: " , username);

            res.status(401).json({error : "Invaild credtials"});
            return; 


        }

        const secret = process.env.JWT_SECRET;

        if(!secret){
            throw new Error("JWT_SECRET is not configured");
        }

      const token = jwt.sign({
        userId: response.id
      }, secret, {expiresIn : '1h'});

      return res.status(200).json({

        id : response.id,
        token,
      }
      ); 


    }
    catch (e) {
        console.error(e);

                res.status(500).json({ error: "Internal Server Error", details: String(e) });

    }
 
    });


    app.post('/api/v1/onRamp' ,authmiddleware , ( req , res) => { 

        // increase the users balence 



        
    });

    app.post('/api/v1/orders' , authmiddleware , (req , res ) => { 

        // all the endpoints for orders and all 



    }); 




app.listen(3000, () => {
    console.log('Server is running on port 3000');
});
