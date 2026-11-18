// this file is mostly used for the case in which we have to that will pull the markets and all the related 
// markets into the main file 

import {prisma} from "db"; 

import {Router} from "express"; 
import { authmiddleware } from "../middleWare/authMiddleware";


export const marketRouter = Router();


marketRouter.get("/markets", authmiddleware, (req,res)=> {

    try {
        

    }catch{


    }
})