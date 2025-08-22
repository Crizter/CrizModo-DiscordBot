import mongoose from "mongoose";

// role schema to store the roles of users in a server.
const roleSchema = new mongoose.Schema({
    userId :{
        type : String, 
        required: true, 
        index: true
    }, 
    serverId : {
        type : String, 
        required: true, 
        index: true,
    },
    roleIds : { 
        type : [String],
        required: true,
        default: [],
    }, 

}, {
    timestamps: true,
}) ; 


const userRoles = mongoose.model('UserRoles', roleSchema);

export default userRoles ; 