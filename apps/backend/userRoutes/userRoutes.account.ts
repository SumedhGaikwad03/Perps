import {prisma} from "db" ; 

import {Router} from "express"; 
import { authRouter } from "../coreRoutes/auth.routes";
import { authmiddleware } from "../middleWare/authMiddleware";


export const userRouter = Router();

// these are all the orders that are useful to the user as to use as in endpoint 
// this endpoint does not need to be in the engine as this can be done by in normal time mostly 



userRouter.get("/Account" , authmiddleware , (req , res) => {

    try {

        const userId = req.userId!; 

        // we have the user id to work with now lets start to work on the things 
        // this endpoint will essentially give the user the entire snapshot of his current position 






    }catch {


    }
}) ;

userRouter.get("wallet", authmiddleware , (req, res) => {
     try {



    }
    catch{



    }
});

userRouter.get("/Positions", authmiddleware , (req , res)=> {

    try{

    }catch{


    }
});

userRouter.get("/openOrders",authmiddleware,(req,res)=> {

    try{

    }catch{


    }
});

userRouter.get("/orderHistory" ,authmiddleware , (req,res)=> {

    try{


    }catch{


    }
}); 