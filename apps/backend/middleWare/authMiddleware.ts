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

    const adminSecret =
        (req.headers.admin_secret as string) ||
        (req.headers["x-admin-token"] as string) ||
        (req.headers.token as string); 

    // If raw admin secret matches ADMIN_SECRET
    if (adminSecret && adminSecret === process.env.ADMIN_SECRET) {
        if (req.headers.token) {
            try {
                const userDecoded = jwt.verify(req.headers.token as string, process.env.JWT_SECRET!) as JwtPayload;
                if (userDecoded?.userId) {
                    (req as any).userId = userDecoded.userId;
                }
            } catch (e) {}
        }
        return next();
    }

    // If signed JWT passed
    if (adminSecret) {
        try {
            const decoded = jwt.verify(adminSecret, process.env.ADMIN_SECRET!) as JwtPayload; 
            if(decoded && decoded.userId){
                (req as any).userId = decoded.userId; 
                return next();
            }
        } catch(e) {}
    }

    return res.status(403).json({message : "Token is invaild bro "});
}