declare global {

    namespace Express {

        interface Request {

            userId? : string 
        }
    }
}

export {};  // this is basically deckarng merging in the typescript context in the reequest object 

