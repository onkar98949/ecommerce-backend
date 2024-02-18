const express = require('express')
const app = express();
const port = process.env.PORT || 8000;
require("dotenv").config();
const mongoose = require('mongoose')
const registered = require('./UserSchema')
const account = require('./AccountSchema')
const cors = require('cors')
const jwt = require('jsonwebtoken')
const cookieParser = require('cookie-parser')
const multer = require('multer');
const uploadMiddleware = multer({ dest: 'uploads/' })
const fs = require('fs');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

app.use(cors({ credentials: true, origin: 'https://effervescent-pasca-1ea9bc.netlify.app' }));
app.use(express.json());
app.use(cookieParser());
app.use('/uploads',express.static(__dirname+'/uploads'))

app.post('/register', async (req, res) => {
    try {
        const { name, email, password } = req.body;

        const existingUser = await registered.findOne({email});

        if(existingUser){
            return res.status(400).json('User Already exists')
        }
        const newUser = registered({
            name,email,password
        })
        await newUser.save();
        jwt.sign({ email, id: newUser._id }, 'seceret123', {}, (err, token) => {
            if (err) throw err;
            res.status(200).cookie('token', token).json({
                id:newUser._id,
                email
            })
        })
        // res.json(newUser)

    } catch (err) {
        res.status(500).json('Server error')
    }
})

app.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        const userData = await registered.findOne({ email, password })
        
        if (userData) {
            jwt.sign({ email, id: userData._id }, 'seceret123', {}, (err, token) => {
                if (err) throw err;
                res.cookie('token', token).json({
                    id:userData._id,
                    email
                })
            })
        }else{
            return  res.status(400).json({error:'Wrong Credentials1'})
        }
    } catch (error) {
        res.status(400).json({error:'Wrong Credentials'})
    }
})

app.get('/profile', (req, res) => {
    const { token } = req.cookies;
    jwt.verify(token, 'seceret123', {}, (err, info) => {
        if (!err) {
        res.json(info);}
    });
});

app.post('/logout', (req, res) => {
    res.cookie('token', '').json('ok')
})

app.get('/account',(req,res)=>{
    const { token } = req.cookies;
    jwt.verify(token, 'seceret123', {}, async(err, info) => {
        if (err){ return res.status(401).send("Page Not Found") };
        email = info.email;
        const user = await account.findOne({email});
        if(user){
            return res.status(200).json(user)
        }
        return res.status(403).json('Account not found')
    });
})

app.post('/personal-details', uploadMiddleware.single('file'), async (req, res) => {
    const { originalname, path } = req.file;
    const parts = originalname.split('.');
    const ext = parts[parts.length - 1];
    const newPath = path + '.' + ext;
    fs.renameSync(path, newPath);
    const { token } = req.cookies;
    jwt.verify(token, 'seceret123', {}, async(err, info) => {
        if (err) throw err;
        email = info.email;
        const { name , phone, city ,pincode , address } = req.body
        const user_account = account({
            email,name,phone,city,address,pincode,cover: newPath,
        })
        await user_account.save();
        res.status(200).json(user_account);
    });
})


app.put('/edit-profile',uploadMiddleware.single('file'),async(req,res)=>{
    let newPath = null;
    if(req.file){
        const { originalname, path } = req.file;
        const parts = originalname.split('.');
        const ext = parts[parts.length - 1];
        newPath = path + '.' + ext;
        fs.renameSync(path, newPath); 
    }
    const { token } = req.cookies;
    jwt.verify(token, 'seceret123', {}, async(err, info) => {
        if (err) throw err;
        const email = info.email
        const {  phone , city , pincode , address, name } = req.body
        const account_detail = await account.findOne({email});
    
        await account.updateOne({email,pincode,name,phone,city,address,cover:newPath? newPath:account_detail.cover,})
        
        res.json(account_detail);
    });

})

app.post('/checkout',async(req,res)=>{
    try{

        const { products}  = req.body
        const lineItems = products.map(item=>{
            return {
                price_data:{
                    currency:"inr",
                    product_data:{
                        name:item.title
                    },
                    unit_amount:(item.price)*100,
                },
                quantity:item.quantity
            }
       })

        const session = await stripe.checkout.sessions.create({
           payment_method_types:["card"] ,
           mode:'payment',
           line_items:lineItems,
           success_url:'http://localhost:3000/success',
           cancel_url:'http://localhost:3000/cancel'
        })

        res.json({id:session.id})
    }catch(error){
        res.status(500).json({error:error.message})
    }
})


mongoose.connect(process.env.MONGODB_URL)
    .then(() => {console.log('Db Connected');})
    .catch((err) => { err })

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
})