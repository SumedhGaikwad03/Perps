import { BACKEND } from "./config";
import { describe, it, expect, beforeAll } from "bun:test";
import axios from "axios";
import { password } from "bun";

describe("auth endpoints", () => {
  it("should create a new user", async () => {
    const username = `sumedh_${Math.floor(Math.random() * 1000000)}`;

    try {
      const response = await axios.post(`${BACKEND}/api/v1/users`, {
        username,
        password: "testpassword",
      });

      console.log("SUCCESS:", response.status, response.data);

      expect(response.status).toBe(201);
    } catch (error) {
      console.error("ACTUAL ERROR:", error);

      if (axios.isAxiosError(error)) {
        console.error("HTTP STATUS:", error.response?.status);
        console.error("SERVER RESPONSE:", error.response?.data);
      }

      throw error;
    }
  });

    it("should let a user signin", async () => {

    const username = "sumedh_278743";



    try {

      const response = await axios.post(`${BACKEND}/api/v1/login`, {

        username : username,
        password: "testpassword",
      });
      console.log("SUCCESS:", response.status, response.data);

      expect(response.status).toBe(200);

      
    } catch (error){

      if(axios.isAxiosError(error)) {

        console.error("HTTP STATUS",error.response?.status, "Server Response", error.response?.data);

      }
      throw error ; 
    }
  } )

  it ("should not let signup work if the username is wrong " , async () => {

     // this a wrong username 



      const response = await axios.post(`${BACKEND}/api/v1/login`, {

        username : "Sumedh",
        password: "testpassword",
      },{
        validateStatus:() => true ,
      });

      expect(response.status).toBe(401);
      expect(response.data.token).toBe(undefined);
    
  })


  it ("should not let signup work if the password  is wrong " , async () => {

    const username = "sumedh"; // this a wrong username 



      const response = await axios.post(`${BACKEND}/api/v1/login`, {

        username : username,
        password: "test",
      },
     {
      validateStatus : () =>  true ,
     }
    );

      expect(response.status).toBe(401);
      expect(response.data.token).toBe(undefined);
    
  })
});

describe("order routes" ,   async () => {

   const User1 = "sumedh_278743" ; // this is our user one 
      const User2 = "sumedh_443628" ; // this is our second user 
      const Password = "testpassword " ; // this is our test password for the routes 

      let token1 = "" ;
      let token2 = ""; 

      let MARKET_ID = "" ; 
    

  beforeAll( async  () => { 

      // const User1 = "sumedh_278743" ; // this is our user one 
      // const User2 = "sumedh_443628" ; // this is our second user 
      // const Password = "testpassword " ; // this is our test password for the routes 

      // let token1 ;
      // let token2 ; 

      const response1 = await axios.post(`${BACKEND}/api/v1/login` , {

        username : User1, 
        password : Password
      } ) ;

      const response2 = await axios.post(`${BACKEND}/api/v1/login` , {

        username : User2, 
        password : Password
      } ) ;

    token1 = response1.data.token; 
    token2 = response2.data.token; 





  }) // before anything the this hook will run 


  await axios.post(`${BACKEND}/api/v1/onRamp` , {

    amount : 100000
  } ,{

    headers : {
      token : token1
    }
  })

  await axios.post(`${BACKEND}/api/v1/onRamp` , {

    amount : 100000 
  } ,{

    headers : {
      token : token2
    }
  })


it("first order should sit on the book " , async () => {

  const response = await axios.post(`${BACKEND}/api/v1/order`, {

    price : 100 ,
    qty : 100 ,
    side: "long",
    marketId : MARKET_ID,
    type : "limit",
    equity: 1000
  }, {
    headers :{
      token : token1 
    }
  })

  expect(response.data.filledQty).toBe(0);
  expect(response.status).toBe(200);
  expect(response.data.orderId).toBeDefined();




})

it("second order from user 2 should also sit on the book if its by user 2 " , async () => {

  const response = await axios.post(`${BACKEND}/api/v1/order`, {

    price : 102 ,
    qty : 10 ,
    side : "short",
    marketId : MARKET_ID, 
    Type : "limit",
    equity : 5000 
  }, {

    headers : {
      token : token1 
    }
  })
  expect(response.data.filledQty).toBe(0);
  expect(response.status).toBe(200);
  expect(response.data.orderId).toBeDefined();

})




 it("third order should be matched " , async () => {

  const response = await axios.post(`${BACKEND}/api/v1/order` , {


    price :100 ,
    qty : 5 ,
    side : "short",
    marketId : MARKET_ID , 
    type : "limit" ,
    equity : 5000 
 }, {
  headers : {

    token: token2
  }


  })
  expect(response.data.filledQty).toBe(5);
  expect(response.status).toBe(200);
  expect(response.data.orderId).toBeDefined();



 })

 


})





