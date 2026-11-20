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
const channelSubscriber = new Map<string , Set<ServerWebSocket<SocketData>>>();

// the below sniipet is for private notifications for thr users 
// it has alll the connections belonging to that user here 
// mostly used for user specfic notificaions 
// managaed by the websocket gateway 
const userSocket = new Map<string , Set<ServerWebSocket<SocketData>>>();

// creating a redis subscriber client now 

const subscriber = createClient();

await subscriber.connect();

console.log("connected to redis pub  sub ");

async function ensureRedisSubscription (channel : string ){
    // check if he current channel exists in the channel Subscriber array 
    if(channelSubscriber.has(channel)) return ;

    // the current channel does not exist then we have new map for the current channel now \
    channelSubscriber.set(channel,new Set());


    // time to listen to the local channel and broadcast it to the local sockets 
    // this is an imp block as here we subscribe form the main bus and then broadcast it 
    // to the other sockets 

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
// pSubscriobe lets to listen mytilpe redis channels at onece 
await subscriber.pSubscribe("pub:user:*",(message, channel)=> {
// in the above function the messahe holds the message and the channel is the user itself 

const userId = channel.replace("pub:user:","");

// find the sockets that these users are connected to 

const sockets = userSocket.get(userId);

if(!sockets || sockets.size == 0){
    return ;
}

const payload = JSON.stringify({
    channel : userId,
    data : JSON.parse(message)
});


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

    if(!token){
        try{
            const decoded = jwt.verify(token,JWT_SECRET) as JwtPayload ;
            userId : decoded.userId;

        }catch(e){


        }
    }

    const upgraded = server.upgrade(req, {
        data : {
            id:crypto.randomUUID(),
            userId,
            subscriptions : new Set<string>(),
        },
    });

    return upgraded ? undefined : new Response("WebSocket upgrade failed ", {status : 404});
 },
// need to 
 websocket : {
    open(ws){
        // user is authtecated via handshake url token 
        if(ws.data.userId){
            if(!userSocket.has(ws.data.userId)){
                userSocket.set(ws.data.userId, new Set());
            }
            userSocket.get(ws.data.userId)!.add(ws);
        }
        ws.send(JSON.stringify({type: "connected", id: ws.data.id}));
    },
   async message(ws, message){
    try{
     const data = JSON.parse(message.toString());

     if(data.action === "ping"){
       ws.send(JSON.stringify({type: "pong"}));
       return;
     }
    }catch{

    }
   }
 }


})