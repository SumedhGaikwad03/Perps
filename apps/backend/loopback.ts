import { resolve } from "bun";
import type {toEngine} from "common"; 
import { createClient } from "redis";

const client = createClient();
const subscriber = createClient(); 
  

const BACKEND_CONSUMER_GROUP = "backend-consumer-group";
const CONSUMER_NAME = "backend-instance-one";

async function initializeRedis(){

    await Promise.all([
        client.connect() ,
        subscriber.connect()
    ]);

try {
await client.xGroupCreate("to-backend", BACKEND_CONSUMER_GROUP , "$" ,
    {
        MKSTREAM :true 
    }
);
}catch(error){
    if(
        !(error instanceof Error) || !(error.message.includes("BUSYGROUP"))
    ){
        throw error ; 
    }


} }




const loopBackResolves = new Map<string , (value : unknown) => void > 
// here we map the resloves that are accumating in the in memeory app 
// this above sniipped stroes the loppback id and its promise to be resoled later 
export function loopback( message : toEngine ) : Promise<unknown> {

    return new Promise( (resolve , reject ) => {


        const loopbackId = Math.random().toString();
        
        loopBackResolves.set(loopbackId, resolve); // this sorted the  the loopback id that and the resolve  

        console.log("loopback resolve this is prior to the resolve ");
         
         // add the reques to the queue called engine with the message like loopbackid and all 
        client.xAdd("engine", "*", {loopbackId , ...message})
        .then(()=> {
            console.log("request  published succesfully ")
    })
       .catch((error) => {

        loopBackResolves.delete(loopbackId); // if the request go haywire then we delete that id from loopback resolve 
        reject(error); 
       }); 
      // loopBackResolves.set(loopbackId,resolve);

       setTimeout(()=> {

        if(loopBackResolves.get(loopbackId)){
            reject();
            loopBackResolves.delete(loopbackId);
        }
       },10000);


        
        
     // name of the redis stream we push is engine and , * is the unique msg id 
         console.log("loopback has been published to a queue");
        //loopback.Resolves.set(loopbackId, resolve); 

    });


}

// now the loopback also  needs to listen to the msg that it just created 

async function main () { 

    while(1){

    const currentMsg = await subscriber.xReadGroup(BACKEND_CONSUMER_GROUP, CONSUMER_NAME , [{

        key : "to-backend", 
        id : ">"
    }] , {

        BLOCK : 0 ,
        COUNT : 1 ,

    }
     );

     const entry  = currentMsg?.[0]?.messages[0]; //this is the msg that the other queue responed with and this is genrally an array of messages that the other queue sends 
     // to us 

     if(!entry){
        continue;
     }

     const message = entry.message; // this is the actual message that was intitally stored on the map  

     const resolved = loopBackResolves.get(message.loopbackId);  // checks if that id still exists in the map 

     if(resolved){
        loopBackResolves.delete(message.loopbackId);
        resolved(message.result);
     }

      //loopBackResolves.get(message.loopbackId)?.();
      //loopBackResolves.delete(message.loopbackId); 

      // to make the ack 

      await subscriber.xAck("to-backend", BACKEND_CONSUMER_GROUP,
        entry.id
      ) // this snipped tell that the 



    }
}
initializeRedis()
.then(()=> main())
.catch(console.error);

