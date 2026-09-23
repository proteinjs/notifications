// The key the recipients' address digests (RequestDigests) derive from; a process without one refuses to digest.
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'email-server-test-secret';
