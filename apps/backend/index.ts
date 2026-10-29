
import express, { response } from 'express';
import { prisma } from 'db'; // or your custom db import
import jwt from "jsonwebtoken";

import {authmiddleware} from "./authMiddleware";

import {createClient} from "redis"; 
import { loopback } from './loopback';

const client = createClient();

client.connect(); 



const app = express();

app.use(express.json()); // Essential for parsing JSON bodies in POST requests

app.post('/api/v1/signup', async (req, res) => {

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

app.post('/api/v1/signin' , async (req , res) => {

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


    app.post('/api/v1/admin/market' , async ( req , res ) => {

        const {symbol  , imgUrl} = req.body;   

        const token = req.headers.token;
        
        console.log(token); 
        console.log(process.env.ADMIN_SECRET); 
        if(token != process.env.ADMIN_SECRET){

            res.status(403).json({
                message: " this token is invaild broo "
            })
            return ; 
        }

        const response  = await prisma.market.create({

            data : {

                slug : symbol ,
                imgUrl : imgUrl ,
            }
        })

        // const queryResponse = await client.xAdd("engine-queue" , "*" , {

        //     type : "create_market",
        //     marketId : response.id 
        // }); // this query is not needed here we have migated to use loppback for this 


        // we have to define an loop back intrepted here that would define  if the in memeroy response are in place 
        // need a loop back engine for this task 

        const queuedLoopbackResponse = await loopback({

            messageType: "create_market", 
            marketId : response.id,
            imageUrl : response.imgUrl,
            symbol : response.slug
        });  




        res.json({id:response.id ,
            message :  " well done market is created bro "})



    })


    app.post('/api/v1/onRamp' ,authmiddleware , async ( req , res) => { 

        const userId : string = req.userId!;   // decoded by the  middleware 

        console.log("req has reached loopback ");
        const queuedLoopbackResponse = await loopback({

            messageType: "onRamp",
            amount : req.body.amount.toString(),
            userId: userId 
        }

        );

            if(queuedLoopbackResponse){
            console.log(`money deposited in da bank`) ; 
        }


        return res.status(200).json({
            message: "onramp is done ",
            result : queuedLoopbackResponse
        }); 
    });

    app.post('/api/v1/orders' , authmiddleware , (req , res ) => { 



        const userId : string = req.userId! ; // extacting the user id here 
        // from the middle ware 

        console.log("request has reached here "); 

        const loopbackResponse = await loopback({

            messageType : "create_order_bid"
            qyt : 


        })

        

        



    }); 




app.listen(3000, () => {
    console.log('Server is running on port 3000');
});
