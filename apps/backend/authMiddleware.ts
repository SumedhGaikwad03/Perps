import type { NextFunction , Request , Response } from "express"; 

import jwt from "jsonwebtoken" ; 


export function authmiddleware ( req : Request , res: Response , next :NextFunction){

    const token =  req.headers.token;

    try {

        const decoded = jwt.verfy(token , process.env.JWT_SECRET!); 

        if(decoded){

            req.userId = userId; 
        }
        else{

            res.status(403).json({

                message: "Incorrect token "
            })
        }
        


    }
    catch(e){
        res.status(403).json({

               Message : "Incorrect token "; 
            })
            
        }


} 