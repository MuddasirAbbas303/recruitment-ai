import assert from 'node:assert/strict'
import test from 'node:test'
import {
  generateInterviewCalendar,
  generateInterviewInvitation,
  getInterviewCalendarFilename,
  InterviewInvitationValidationError,
  zonedDateTimeToUtc,
} from './candidateInterviewService.js'

const testNow = new Date('2026-09-10T09:00:00.000Z')

function buildRequest(overrides = {}) {
  return {
    candidate: {
      fullName: 'Jordan Lee',
      email: 'jordan@example.com',
      currentTitle: 'Backend Engineer',
    },
    interview: {
      title: 'Interview - Jordan Lee',
      date: '2026-09-15',
      time: '14:00',
      timezone: 'Europe/Riga',
      durationMinutes: 60,
      meetingType: 'Video Call',
      meetingLocation: 'https://meet.example.com/interview',
      notes: 'Please bring questions about the role.',
    },
    job: {
      role: 'Senior Backend Developer',
      requiredSkills: ['Node.js'],
      preferredSkills: ['AWS'],
      location: 'Latvia',
      description: 'Build reliable services.',
    },
    ...overrides,
  }
}

test('mock invitation is deterministic, editable-shaped, and score-free', async () => {
  const previousMockSetting = process.env.USE_MOCK_AI
  process.env.USE_MOCK_AI = 'true'

  try {
    const first = await generateInterviewInvitation(buildRequest(), {
      now: testNow,
    })
    const second = await generateInterviewInvitation(buildRequest(), {
      now: testNow,
    })
    const text = `${first.subject}\n${first.body}`

    assert.deepEqual(first, second)
    assert.equal(first.subject, 'Interview - Jordan Lee')
    assert.match(first.body, /2026-09-15/)
    assert.match(first.body, /14:00 \(Europe\/Riga\)/)
    assert.match(first.body, /60 minutes/)
    assert.match(first.body, /https:\/\/meet\.example\.com\/interview/)
    assert.doesNotMatch(text, /score|\b\d{1,3}%\b/i)
  } finally {
    if (previousMockSetting === undefined) {
      delete process.env.USE_MOCK_AI
    } else {
      process.env.USE_MOCK_AI = previousMockSetting
    }
  }
})

test('provider input excludes candidate email', async () => {
  let providerCandidate

  await generateInterviewInvitation(buildRequest(), {
    now: testNow,
    generator(candidate) {
      providerCandidate = candidate
      return {
        subject: 'Interview invitation',
        body: 'Hi Jordan, your interview is scheduled.\n\nBest,\n[Recruiter]',
      }
    },
  })

  assert.equal(providerCandidate.fullName, 'Jordan Lee')
  assert.equal(providerCandidate.email, undefined)
})

test('converts Riga wall time to UTC and creates valid in-memory ICS content', () => {
  const startsAt = zonedDateTimeToUtc(
    '2026-09-15',
    '14:00',
    'Europe/Riga',
  )
  const calendar = generateInterviewCalendar(
    {
      candidate: buildRequest().candidate,
      interview: buildRequest().interview,
      description: 'Interview details, questions welcome.',
    },
    {
      now: testNow,
      uid: 'step36-test@recruitment-ai.local',
    },
  ).toString('utf8')

  assert.equal(startsAt.toISOString(), '2026-09-15T11:00:00.000Z')
  assert.match(calendar, /^BEGIN:VCALENDAR\r\nVERSION:2\.0\r\n/)
  assert.match(calendar, /UID:step36-test@recruitment-ai\.local\r\n/)
  assert.match(calendar, /DTSTART:20260915T110000Z\r\n/)
  assert.match(calendar, /DTEND:20260915T120000Z\r\n/)
  assert.match(calendar, /SUMMARY:Interview - Jordan Lee\r\n/)
  assert.match(
    calendar,
    /LOCATION:https:\/\/meet\.example\.com\/interview\r\n/,
  )
  assert.match(calendar, /DESCRIPTION:Interview details\\, questions welcome\./)
  assert.match(calendar, /END:VCALENDAR\r\n$/)
})

test('rejects missing email, past times, and invalid timezones', async () => {
  await assert.rejects(
    generateInterviewInvitation(
      buildRequest({
        candidate: {
          fullName: 'Jordan Lee',
          email: '',
          currentTitle: null,
        },
      }),
      { now: testNow },
    ),
    InterviewInvitationValidationError,
  )

  await assert.rejects(
    generateInterviewInvitation(
      buildRequest({
        interview: {
          ...buildRequest().interview,
          date: '2026-09-09',
        },
      }),
      { now: testNow },
    ),
    InterviewInvitationValidationError,
  )

  assert.throws(
    () =>
      generateInterviewCalendar(
        {
          candidate: buildRequest().candidate,
          interview: {
            ...buildRequest().interview,
            timezone: 'Not/A_Timezone',
          },
        },
        { now: testNow },
      ),
    InterviewInvitationValidationError,
  )
})

test('generates a filesystem-safe calendar filename', () => {
  assert.equal(
    getInterviewCalendarFilename(
      { fullName: 'Jordan Lee' },
      { date: '2026-09-15' },
    ),
    'interview-jordan-lee-2026-09-15.ics',
  )
})
