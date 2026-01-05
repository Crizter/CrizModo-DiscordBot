import mongoose  from "mongoose";

const groupSessionSchema = new mongoose.Schema(
    {
        sessionId : { 
            type : String, 
            required:true, 
            unique : true, 

        }, 
        guildId : { 
            type : String,
            required: true,
            
        },
        channelId : {
            type: String, 
            required : true,
        },
        hostUserId: { 
            type: String, 
            required: true, 
            
        },
        isActive : {
            type: Boolean, 
            default: false,
        },
        status : { 
            type: String, 
            enum: ['waiting', 'active', 'completed'],
            default: 'waiting',
        },
        phase: { 
            type: String, 
            enum : ["study", "break", "long_break"],
            default: "study",
        }, 
        // timing 
        startTime:{ 
            type:Date,
            default: null,
        }, 
        endTime : { 
            type: Date,
            default: null,
        },
        actualEndTimeStamp: { 
            type: Date,
            default: null,
        },
        // configuration
        workDuration: { 
            type: Number, 
            required: true, 
            min: 5, 
            max: 180,
        },
        breakDuration: 
        {
            type: Number,
            required:true,
            min:1,
            max:60,
        },
        longBreakDuration:
        {
            type: Number, 
            required: true,
            min: 30,
            max:120,
        },
        sesssionBeforeLongBreak: { 
            type: Number,
            required: true, 
            min: 1, 
            max:10,
        },
        maxSessions: { 
            type: Number,
            required: true,
            min: 1, 
            max: 10
        },
        // State 
        completedSessions: { 
            type: Number,
            default: 0,
        },
        participants: [{
            userId: String,
            joinedAt: Date,
            isActive: Boolean,
        }],
        maxParticipants: { 
            type: Number, 
            default: 5,
            max: 10
        },
    },
    { 
        timestamps: true
    }
) ; 

groupSessionSchema.index({
    createdAt: 1
},
    { 
        expireAfterSeconds: 7200,
        partialFilterExpression: {status:"completed"},
    }
)   ;
export const GroupSession = mongoose.model("GroupSession", groupSessionSchema) ; 