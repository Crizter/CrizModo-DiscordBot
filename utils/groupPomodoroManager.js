import { GroupSession } from "../models/GroupSession.js";
import { Session } from "../models/sessions.models.js";

// Store group timers
export const activeGroupTimers = new Map();

// Generate unique session ID
export function generateSessionId() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Check if user has any active session (individual or group)
export async function hasActiveSession(userId) {
    // Check individual session
    const individualSession = await Session.findOne({ userId, isActive: true });
    if (individualSession) {
        return { type: 'individual', session: individualSession };
    }

    // Check group session participation
    const groupSession = await GroupSession.findOne({
        'participants.userId': userId,
        'participants.isActive': true,
        status: { $in: ['waiting', 'active'] }
    });

    if (groupSession) {
        return { type: 'group', session: groupSession };
    }

    return null;
}

// Get user's group session
export async function getUserGroupSession(userId) {
    return await GroupSession.findOne({
        'participants.userId': userId,
        'participants.isActive': true,
        status: { $in: ['waiting', 'active'] }
    });
}

// Add participant to group session
export async function addParticipant(sessionId, userId) {
    const session = await GroupSession.findOne({ sessionId, status: { $ne: 'completed' } });
    if (!session) {
        throw new Error('Session not found or completed');
    }

    // Check if already a participant
    const existingParticipant = session.participants.find(p => p.userId === userId);
    if (existingParticipant) {
        if (existingParticipant.isActive) {
            throw new Error('Already in this session');
        } else {
            // Reactivate participant
            existingParticipant.isActive = true;
            await session.save();
            return session;
        }
    }

    // Check participant limit
    const activeParticipants = session.participants.filter(p => p.isActive);
    if (activeParticipants.length >= session.maxParticipants) {
        throw new Error('Session is full');
    }

    // Add new participant
    session.participants.push({
        userId,
        joinedAt: new Date(),
        isActive: true
    });

    await session.save();
    return session;
}

// Remove participant from group session
export async function removeParticipant(sessionId, userId) {
    const session = await GroupSession.findOne({ sessionId, status: { $ne: 'completed' } });
    if (!session) {
        throw new Error('Session not found');
    }

    const participant = session.participants.find(p => p.userId === userId && p.isActive);
    if (!participant) {
        throw new Error('Not a participant in this session');
    }

    participant.isActive = false;
    await session.save();

    // If host leaves, end the session
    if (session.hostUserId === userId) {
        session.status = 'completed';
        await session.save();
        
        // Clear timer
        const timer = activeGroupTimers.get(sessionId);
        if (timer) {
            clearTimeout(timer);
            activeGroupTimers.delete(sessionId);
        }
    }

    return session;
}

// Get active participants count
export function getActiveParticipantsCount(session) {
    return session.participants.filter(p => p.isActive).length;
}

// Check if user is host
export function isHost(session, userId) {
    return session.hostUserId === userId;
}

// Get default settings for user (from their individual session settings)
export async function getDefaultSettings(userId) {
    const userSession = await Session.findOne({ userId });
    
    if (userSession) {
        return {
            workDuration: userSession.workDuration,
            breakDuration: userSession.breakDuration,
            longBreakDuration: userSession.longBreakDuration,
            sessionsBeforeLongBreak: userSession.sessionsBeforeLongBreak,
            maxSessions: userSession.maxSessions || 8
        };
    }

    // Default settings if user has no individual session
    return {
        workDuration: 25,
        breakDuration: 5,
        longBreakDuration: 15,
        sessionsBeforeLongBreak: 4,
        maxSessions: 8
    };
}