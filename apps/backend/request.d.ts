declare global {

    namespace Express {

        interface Request {

            userId? : string 
        }
    }
}

export {};  // this is basically deckarng merging in the typescript context in the 
// reequest object  as we will attach the userid directly through the request 
// so we can just do this as req.userId 


