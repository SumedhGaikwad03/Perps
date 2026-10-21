import {PrismaClient} from './generated/prisma/client';

import {PrismaPg} from "@prisma/adapter-pg";


const adapter =  new PrismaPg({
    connectionString : process.env.DatabaseUrl, 
});

export const prisma = new PrismaClient({
    adapter 
}); 

// the job of this file is to export the prisam client 

