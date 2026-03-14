import { Request, Response, NextFunction } from 'express';
import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';

// Load config for project ID
let projectId = process.env.VITE_FIREBASE_PROJECT_ID;

try {
  const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
  if (fs.existsSync(configPath)) {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    projectId = projectId || config.projectId;
  }
} catch (e) {
  console.error('Error loading firebase-applet-config.json in auth.ts:', e);
}

// Initialize Firebase Admin if not already initialized
if (admin.apps.length === 0) {
  if (!projectId) {
    console.warn('⚠️ No Firebase Project ID found. Auth verification may fail.');
  }
  admin.initializeApp({
    projectId: projectId,
  });
}

export interface AuthRequest extends Request {
  user?: admin.auth.DecodedIdToken;
}

export const authenticate = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: No token provided' });
  }
  
  const idToken = authHeader.split('Bearer ')[1];
  
  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    req.user = decodedToken;
    next();
  } catch (error) {
    console.error('Error verifying Firebase ID token:', error);
    return res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }
};

export const authorizeAdmin = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const adminSecret = req.headers['x-admin-secret'];
  const expectedSecret = process.env.ADMIN_SECRET;
  
  // 1. Check for the secret (legacy/simple)
  if (adminSecret && expectedSecret && adminSecret === expectedSecret) {
    return next();
  }

  // 2. Check for Firebase Admin role
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const idToken = authHeader.split('Bearer ')[1];
    try {
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      
      // Check if email is the default admin email and is verified
      const defaultAdminEmail = "shepintolik4@gmail.com";
      if (decodedToken.email === defaultAdminEmail && decodedToken.email_verified) {
        req.user = decodedToken;
        return next();
      }

      // Or check for a custom claim 'admin'
      if (decodedToken.admin === true) {
        req.user = decodedToken;
        return next();
      }
    } catch (e) {
      // Fall through to error
    }
  }
  
  return res.status(403).json({ error: 'Forbidden: Admin access required' });
};
