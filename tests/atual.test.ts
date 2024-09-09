import Fastify from 'fastify';
import supertest from 'supertest';
import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';
import * as handlers from '../src/handlers/track.handlers'; // Adjust the import path based on your project structure
import prisma from '../src/prismaClient';

const app = Fastify();

app.post('/read', handlers.isEmailRead);
app.post('/ping', handlers.pingEmail);
app.post('/create', handlers.createTickets);
app.get('/tickets', handlers.getTickets);

beforeAll(async () => {
    await prisma.$connect(); // Connect to the database
    await app.ready();
});

afterAll(async () => {
    await prisma.$disconnect(); // Disconnect from the database
    await app.close();
});

beforeEach(async () => {
    // Clean up the database before each test
    await prisma.tickets.deleteMany(); // This removes all ticket records to start fresh
});

describe('Ticket Handlers Integration Tests', () => {
    describe('POST /create', () => {
        it('should create a ticket successfully', async () => {
            const response = await supertest(app.server)
                .post('/create')
                .send({ emailId: 'test@example.com', userId: '123' });

            expect(response.status).toBe(201);
            expect(response.body).toEqual({ message: 'ticket send successfully' });

            // Optional: Verify the entry in the database
            const tickets = await prisma.tickets.findMany();
            expect(tickets.length).toBe(1);
            expect(tickets[0]).toMatchObject({ emailId: 'test@example.com', userId: '123' });
        });

        it('should return 500 if there is an error creating a ticket', async () => {
            // To simulate an error, you could manually cause an error in your handler or check how it handles invalid data.
            // Since this is difficult with a real database, this test might be less useful when not mocking.
            const response = await supertest(app.server)
                .post('/create')
                .send({ emailId: null, userId: '123' }); // Assuming emailId is required

            expect(response.status).toBe(500);
            expect(response.body).toHaveProperty('error');
        });
    });

    describe('GET /tickets', () => {
        it('should fetch tickets successfully', async () => {
            // Create a ticket directly in the database for the test
            await prisma.tickets.create({
                data: { emailId: 'test@example.com', userId: '123' },
            });

            const response = await supertest(app.server)
                .get('/tickets')
                .query({ emailId: 'test@example.com' });

            expect(response.status).toBe(200);
            //   expect(response.body).toEqual({
            expect(response.body).toMatchObject({
                // actual strucutre not required
                user: [{ emailId: 'test@example.com', userId: '123' }],
                message: 'Tickets fetched successfully',
            });
        });

        it('should return 401 if there missing required fields', async () => {
            // Simulate the error by querying with invalid data if applicable.
            // With real databases, specific error cases can be hard to simulate without control over the data layer.
            const response = await supertest(app.server)
                .get('/tickets')
                .query({ invalidField: 'invalidValue' }); // Example of an incorrect query parameter

            expect(response.status).toBe(401);
            expect(response.body).toHaveProperty('error');
        });
    });

    describe('POST /read', () => {
        it('should update email as read', async () => {
            // First, create the ticket to update
            const ticket = await prisma.tickets.create({
                data: { emailId: 'test@example.com', userId: '123', readAt: null },
            });

            const response = await supertest(app.server)
                .post('/read')
                .send({ emailId: 'test@example.com', userId: '123' });

            expect(response.status).toBe(200);
            expect(response.body).toEqual({ message: 'Email read successfully', success: true });

            // Verify the update in the database
            const updatedTicket = await prisma.tickets.findUnique({ where: { id: ticket.id } });
            expect(updatedTicket.readAt).not.toBeNull();
        });

        it('should return 404 if the tracking record is not found', async () => {
            const response = await supertest(app.server)
                .post('/read')
                .send({ emailId: 'notfound@example.com', userId: '123' });

            expect(response.status).toBe(404);
            expect(response.body).toEqual({ error: 'Tracking record not found' });
        });
    }, 10000);

    describe('POST /ping', () => {
        it('should update ping data successfully', async () => {
            // First, create the ticket to update
            const ticket = await prisma.tickets.create({
                data: { emailId: 'test@example.com', userId: '123', lastPingAt: new Date(), duration: 100 },
            });

            const response = await supertest(app.server)
                .post('/ping')
                .send({ emailId: 'test@example.com', userId: '123' });

            expect(response.status).toBe(201);
            expect(response.body).toEqual({ status: 'ok', message: 'ping success' });

            // Verify the update in the database
            const updatedTicket = await prisma.tickets.findUnique({ where: { id: ticket.id } });
            expect(updatedTicket.lastPingAt).not.toEqual(ticket.lastPingAt);
        });

        it('should return 404 if tracking record is not found', async () => {
            const response = await supertest(app.server)
                .post('/ping')
                .send({ emailId: 'notfound@example.com', userId: '123' });

            expect(response.status).toBe(404);
            expect(response.body).toEqual({ error: 'Tracking record not found' });
        });
    });
});
