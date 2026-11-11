import type { NextFunction , Request , Response } from "express"; 

import jwt, { type JwtPayload } from "jsonwebtoken" ; 


export function authmiddleware ( req : Request , res: Response , next :NextFunction){

    const token =  req.headers.token as string ;

    //const {userId} = req.body.userId; 

    try {

        const decoded = jwt.verify(token , process.env.JWT_SECRET!)  as JwtPayload ; 

        if(decoded.userId){

            req.userId = decoded.userId; 
            next();
        }
        else{

            res.status(403).json({

                message: "Incorrect token "
            })
        }
        


    }
    catch(e){
        res.status(403).json({

               Message : "Incorrect token "
            })
            
        }


}

export function adminMiddleWare(req : Request , res : Response , next : NextFunction){

    const adminToken = req.headers.token as string ; 

    try {

        const decoded = jwt.verify(adminToken , process.env.ADMIN_SECRET!) as JwtPayload; 

        if(decoded.userId){
            
            req.userId = decoded.userId; 
          
            next();
        }
        else {

            return res.status(403).json({message : "TOken id  is invaild bro "});
        }

    }catch(e){

        
            return res.status(403).json({message : "TOken is invaild bro "});
    }
}