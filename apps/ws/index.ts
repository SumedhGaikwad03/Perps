// this os the main file for the ws streaming here  

import {ClientClosedError, createClient} from "redis" ; 

import type { ServerWebSocket } from "bun"; 

// cuz backend sends data that is piggy backed on top a token so that this file could extract the 
// user id form that token 
import jwt , {type JwtPayload} from "jsonwebtoken";

// this socket data is unique for each connection for a browser and what are its subscription 

const PORT = process.env.WS_PORT || 3001 ;

const JWT_SECRET = process.env.JWT_SECRET || "Sumedh123";

//this defines that what each web socket connection looks like here 
interface SocketData {
    id : string ,
    userId? : string ,
    subscriptions : Set<string>
}

// this is basicalyy the as btcusd --> set of connections listening to that thing here 
// as this is the channel name and the number of users subscribed to that channel 
// this is used as whenevern btc has an chanhe then all the connected tokens will receive a tick for the same 
// elimated the need for iterating the users that are currently viwewing
//  the btc market to go to them one by one and givr them the update 
const channelSubscriber = new Map<string , Set<ServerWebSocket<SocketData>>>();

// the below sniipet is for private notifications for thr users 
// it has alll the connections belonging to that user here 
// mostly used for user specfic notificaions 
// managaed by the websocket gateway 
// 
const userSocket = new Map<string , Set<ServerWebSocket<SocketData>>>();

// creating a redis subscriber client now 

const subscriber = createClient();
const redisReader = createClient();

await Promise.all([subscriber.connect(), redisReader.connect()]);

console.log("connected to redis pub sub and reader");

// checks if the basetoken is present as a key in the mao here 
async function ensureRedisSubscription (channel : string ){
    // check if he current channel exists in the channel Subscriber array 
    if(channelSubscriber.has(channel)) return ;

    // the current channel does not exist then we have new map for the current channel now \
    channelSubscriber.set(channel,new Set());


    // this snippet is mostly used as when any other service publish a message to the  channel suscriber then 
    // as the  main binace ws provides a tick for the message then we have to update that tick all the connected 
    // websockets in that area right 
    await subscriber.subscribe(`pub:${channel}`, (rawMessage)=> {

        const client = channelSubscriber.get(channel);
        // if the client is not there or the size is zero then we would just return 
        if(!client || client.size === 0) return ;

        const payload  = JSON.stringify({
            channel,
            data : JSON.parse(rawMessage),
        });

        for(const ws of client ){
 
             // this is a property of the bun serverWebSocket this means that clinet is ready to listen

            if(ws.readyState == 1){
                ws.send(payload);
        }}
    });

}

// up till this point all the genral broadcast messages have been handled by the user 
// pSubscriobe lets to listen multiple redis streams at once 
await subscriber.pSubscribe("pub:user:*",(message, channel)=> {
// in the above function the messahe holds the message and the channel is the user itself 

const userId = channel.replace("pub:user:","");

// find the sockets that these users are connected to 

const sockets = userSocket.get(userId);

if(!sockets || sockets.size == 0){
    return;
} 


const payload = JSON.stringify({
    channel : userId,
    data : JSON.parse(message)
});

// this is the sockets for the user is connected to 
for(const ws of sockets ){

    if(ws.readyState == 1){
        ws.send(payload);
    }
}
// all the users have the message to there private sockets now 

}); 

// we now need to stat the bun server to init in the system 
// need to start to understad this form here 

const server = Bun.serve<SocketData>({
 port : PORT ,
 fetch(req,server){

    const url = new URL(req.url)
    const token = url.searchParams.get("token");
    let userId :string | undefined ;

    if(token){
        try{

        const decoded = jwt.verify(token,JWT_SECRET) as JwtPayload ;
            userId = decoded.userId;

        }catch(e){}
    }

    // upgrade the standard http connection to an websocket connection (persistant)
    const upgraded = server.upgrade(req, {
        // this is how my web socket will look like 
        data : {
            id:crypto.randomUUID(),
            userId,
            subscriptions : new Set<string>(),
        },
    });

    return upgraded ? undefined : new Response("WebSocket upgrade failed ", {status : 404});
 },
// need to check for the websocket 
 websocket : {
    open(ws){
        // user is authtecated via handshake url token 
        if(ws.data.userId){
            // if the user currently does not have a web socket then we create a web socket  
            if(!userSocket.has(ws.data.userId)){
                userSocket.set(ws.data.userId, new Set());
            }
            // if the user has a websocket then we just add this websockrt to the users list 
            userSocket.get(ws.data.userId)!.add(ws);
        }
        // this web socket then sends the connected data to the newly made socket here 
        ws.send(JSON.stringify({type: "connected", id: ws.data.id}));
    },

    // this runs when server recives a meesge form a client 
   async message(ws, message){
    try{
     const data = JSON.parse(message.toString());

     // check for a heartbeat of form the ws 
     if(data.action === "ping"){
       ws.send(JSON.stringify({type: "pong"}));
       return;
     }

      // time for insocket auth , as when we have to some drops and then we 
   // drop that connection so when we again try to persistt to that connection we can 
   // make use of just auth it to upgrade the connection 

   if(data.action === "auth" && data.token){

    try {
       // this is basically trying to upgrade the current websocekt connection to the an authtiticated 
        const decoded = jwt.verify(data.token , JWT_SECRET) as JwtPayload ;
        ws.data.userId = decoded.userId;

        if(!userSocket.has(decoded.userId)){

            userSocket.set(decoded.userId, new Set());
        }
        userSocket.get(decoded.userId)?.add(ws);

        ws.send(JSON.stringify({type : "authenticated" , userId : decoded.userId}));

    }catch(err){
        ws.send(JSON.stringify({type: "error", message : "token not vaild broo" }));
    }
     return;
   }
   // now its time to make a message for the susbcrition of the same 

   // checks if the data that is suppiled to the backend is an array or not as in 
   // prase implecitly the return type is any so that makes sense 
   if(data.action === "subscribe" && Array.isArray(data.channels)){

    // everthing is vaildated then what we can do is find if the key actulyy exsst int he channelStrea data
    
    for(const ch of data.channels){

        // this is basically an upsert for the data key in the array 
        await ensureRedisSubscription(ch);
        // this point we hare sure to have a kwy in the channelsStream 
        channelSubscriber.get(ch)!.add(ws);
        // now add the ch in the users array 
        ws.data.subscriptions.add(ch);

        // send cached snapshot immediately so quiet markets are not blank on connect 
        if (ch.startsWith("depth:")) {
          const target = ch.replace("depth:", "");
          const cached = await redisReader.hGet(`market:${target}:depth`, "data");
          if (cached && ws.readyState === 1) {
            ws.send(JSON.stringify({ channel: ch, data: JSON.parse(cached) }));
          }
        }

        if (ch.startsWith("markPrice:")) {
          const target = ch.replace("markPrice:", "");
          const cached = (await redisReader.hGet(`market:${target}:markPrice`, "data")) ||
                         (await redisReader.hGet("market:markPrices", target));
          if (cached && ws.readyState === 1) {
            ws.send(JSON.stringify({ channel: ch, data: { markPrice: cached, symbol: target } }));
          }
        }
    }
    // now the linking for all the parties is covered here , this is the response to the user that he is subscriped to the socket 

    ws.send(JSON.stringify({type : "subscribed" , channels : data.channels}));
   return; 
   }

   // now its time to unscribe form the websocket 
   if(data.action === "unsubscribe" && Array.isArray(data.channels)){

     for(const ch of data.channels){
      
      // we havr to remove this from the main channel as 
      // delete this socket form the main channel 
      channelSubscriber.get(ch)?.delete(ws);
      // we also remove it form the users websocket here 
      ws.data.subscriptions.delete(ch);

     }
     ws.send(JSON.stringify({type : "unsubscribe" , channels : data.channels}));
     return;


   }

   

   // ti
 }catch(error){

    ws.send(JSON.stringify({type : "error", message : "invald data format "}));

 }


 },

 close(ws){
    // time to close all the websocket connection of this from the main frame now 

    // delete the ws form all the global frame 
    for(const ch of ws.data.subscriptions){
        channelSubscriber.get(ch)?.delete(ws);  
    } 

    // this will mostly be true for all here 
    if(ws.data.userId){
         userSocket.get(ws.data.userId)?.delete(ws);
     if(userSocket.get(ws.data.userId)?.size ===0){
        // we have to remove he user form the map now 
        userSocket.delete(ws.data.userId);
     }
    }



}}

});
console.log(`ws gatway is listenig on the ws:/localhost/${PORT}`);