import express from 'express';
import cors from 'cors';
import joi from 'joi';
import dayjs from 'dayjs';
import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

const server = express();
server.use(cors());
server.use(express.json());



server.post("/participants", async (req, res) => {

    const hora = dayjs().format('HH:mm:ss');

    const participantSchema = joi.object({
        name: joi.string().required()
    });

    const participant = {name: req.body.name, lastStatus: Date.now()};
    const message = {from: req.body.name, to: 'Todos', text: 'entra na sala...', type: 'status', time: hora};

    try{

        const validation = participantSchema.validate(req.body, { abortEarly: true });

        if(validation.error) {
            res.status(422).send(validation.error.message);
            return;
        }

        const mongoClient = new MongoClient(process.env.MONGO_URI);

        await mongoClient.connect();
        const dbBPUOL = mongoClient.db('BPUOL');
        const participantsCollection = dbBPUOL.collection('participants');
        const messagesCollection = dbBPUOL.collection('messages');
        
        const participants = await participantsCollection.find({}).toArray();
        const participantExists = participants.find( e => e.name === req.body.name);

        if (!participantExists) {
            await participantsCollection.insertOne(participant);
            await messagesCollection.insertOne(message);
        }

        if (participantExists) {
            res.sendStatus(409);
            return;
        }
       
        mongoClient.close(); 

        res.send(req.body);
        
    } catch{
        res.sendStatus(500);
    }; 
})

server.get("/participants", async (req, res) => {

    try{

        const mongoClient = new MongoClient(process.env.MONGO_URI);

        await mongoClient.connect();

        const dbBPUOL = mongoClient.db('BPUOL');
        const participantsCollection = dbBPUOL.collection('participants');        
        const participants = await participantsCollection.find({}).toArray();
        
        res.send(participants);  

        mongoClient.close(); 
        
    } catch{
        res.sendStatus(500);
    }; 
})

server.post("/messages", async (req, res) => {

    const hora = dayjs().format('HH:mm:ss');
    const user = req.headers.user;
    const messageBody = req.body;
    const message = Object.assign({}, messageBody, {from: user}, {time: hora})
    

    const messageSchema = joi.object({
        to: joi.string().required(),
        text: joi.string().required(),
        type: joi.string().pattern(/private_message|message/),
        from: joi.string().required(),
        time: joi.string().required()
    });

    try{

        const validation = messageSchema.validate(message, { abortEarly: true });

        if(validation.error) {
            res.status(422).send(validation.error.message);
            return;
        }

        const mongoClient = new MongoClient(process.env.MONGO_URI);

        await mongoClient.connect();

        const dbBPUOL = mongoClient.db('BPUOL');
        const messagesCollection = dbBPUOL.collection('messages');        
        
        await messagesCollection.insertOne(message);

        mongoClient.close(); 

        res.sendStatus(201);
        
    } catch{
        res.sendStatus(500);
    }; 

})

server.get("/messages", async (req, res) => {

    const messagesLimit = req.query.limit;
    const user = req.headers.user;

    try{

        const mongoClient = new MongoClient(process.env.MONGO_URI);

        await mongoClient.connect();

        const dbBPUOL = mongoClient.db('BPUOL');
        const messagesCollection = dbBPUOL.collection('messages');        
        const messages = await messagesCollection.find({}).toArray();

        const filteredMessages = messages.filter(message => message.to === 'Todos' || message.to === user || message.from === user); 

        if(messagesLimit){
            const showMessages = [...filteredMessages].slice(-messagesLimit);
            res.send(showMessages);  
        } else {
            res.send(messages);
        }

        mongoClient.close(); 
        
    } catch{
        res.sendStatus(500);
    }; 
})

server.post("/status", async (req, res) => {

    const user = req.headers.user;

    try{

        const mongoClient = new MongoClient(process.env.MONGO_URI);

        await mongoClient.connect();

        const dbBPUOL = mongoClient.db('BPUOL');
        const participantsCollection = dbBPUOL.collection('participants');        
        const participants = await participantsCollection.find({}).toArray();

        const participantExists = participants.find( participant => participant.name === user);

        if(!participantExists) {
            res.sendStatus(404);
            return;
        }

        await participantsCollection.updateOne({name: req.headers.user},{$set: {lastStatus: Date.now()}});
        
        mongoClient.close(); 
        res.sendStatus(200);

    } catch{
        res.status(500);
    }
})

async function removeInativeUsers() {

    try{

        const hora = dayjs().format('HH:mm:ss');

        const mongoClient = new MongoClient(process.env.MONGO_URI);

        await mongoClient.connect();

        const dbBPUOL = mongoClient.db('BPUOL');
        const participantsCollection = dbBPUOL.collection('participants'); 
        const messagesCollection = dbBPUOL.collection('messages');       
        const participants = await participantsCollection.find({}).toArray();

        const inativeParticipants = participants.filter( participant => (Date.now() - participant.lastStatus) > 10);

        inativeParticipants.map(async inativeP => {

            const messageSaida = {from: inativeP.name, to: 'Todos', text: 'sai da sala...', type: 'status', time: hora}; 
                
            await participantsCollection.deleteOne({name: inativeP.name});
            await messagesCollection.insertOne(messageSaida);  
                
        });
            
        mongoClient.close();  

    } catch(error) {
        console.log(error);
    }
}

setInterval(removeInativeUsers, 15000);

server.listen(5000);