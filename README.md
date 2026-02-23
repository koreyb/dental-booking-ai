# 🦷 Dental Booking AI

Automated booking service for dental practices using Retell AI voice agent and MaxAssist.

## Overview

This service provides:
- **Availability checking** - Real-time appointment slots from MaxAssist
- **Automated booking** - Browser automation to complete booking forms
- **Phone normalization** - Fixes truncation issues with phone number entry
- **Retell AI integration** - Webhook endpoints for voice agent

## Quick Start

```bash
# Install dependencies
npm install

# Start the server
npm start
```

The service runs on `http://localhost:3000`.

## API Endpoints

### Health Check
```bash
GET /health
```

### Check Availability
```bash
POST /check-availability
{
  "date": "2026-02-23",
  "appointmentType": "emergency-exam", // emergency-exam, new-patient, checkup, cleaning
  "provider": "any" // dr-smith, dr-johnson, any
}
```

### Book Appointment
```bash
POST /book-appointment
{
  "firstName": "John",
  "lastName": "Doe",
  "phone": "4805551234",
  "email": "john@email.com",
  "date": "2026-02-23",
  "time": "10:00",
  "appointmentType": "emergency-exam"
}
```

### Format Phone
```bash
POST /format-phone
{
  "phone": "480-555-1234"
}
```

## Retell AI Integration

### Webhook URL
Configure your Retell agent to call:
```
https://your-domain.com/book-appointment
```

### Custom Functions for Retell

Add these custom functions in the Retell dashboard:

**check_dental_availability:**
```json
{
  "name": "check_dental_availability",
  "description": "Check available appointment times for dental services",
  "parameters": {
    "type": "object",
    "properties": {
      "date": { "type": "string", "description": "Date in YYYY-MM-DD format" },
      "appointment_type": { "type": "string", "enum": ["emergency-exam", "new-patient", "checkup", "cleaning"] }
    },
    "required": ["date"]
  }
}
```

**book_dental_appointment:**
```json
{
  "name": "book_dental_appointment",
  "description": "Book a dental appointment for a patient",
  "parameters": {
    "type": "object",
    "properties": {
      "first_name": { "type": "string" },
      "last_name": { "type": "string" },
      "phone": { "type": "string" },
      "email": { "type": "string" },
      "date": { "type": "string" },
      "time": { "type": "string" },
      "appointment_type": { "type": "string" }
    },
    "required": ["first_name", "last_name", "phone", "date", "time"]
  }
}
```

## Deployment

### Local Development
```bash
npm install
npm start
```

### Production (Railway/Render/DigitalOcean)
```bash
# Set environment variables
PORT=3000

# Deploy
git push origin main
```

### Required Environment
- Node.js 18+
- Playwright browsers (installed automatically)

## Known Issues Fixed

### Phone Number Truncation
The MaxAssist form sometimes truncates phone numbers (e.g., "480-555-01" instead of "480-555-0123"). This service:
1. Normalizes phone numbers before entry
2. Verifies phone was entered correctly
3. Retries with different formatting if truncation detected

## License

MIT
