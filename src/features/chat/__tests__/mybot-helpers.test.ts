import { bucketMyBotReminderTasks, buildMyBotTaskPayload, parseMyBotTaskDrafts } from "@/src/features/chat/mybot-helpers";

describe("mybot-helpers", () => {
  it("parses task drafts from ai json and normalizes dueAt", () => {
    const drafts = parseMyBotTaskDrafts(
      JSON.stringify({
        tasks: [
          {
            title: "Follow up with design team",
            assignee: "Jason",
            priority: "high",
            dueAt: "2026-03-12 09:00",
            reason: "Summarize the decision and unblock execution.",
          },
          {
            title: "Follow up with design team",
            assignee: "Jason",
            priority: "high",
            dueAt: "2026-03-12 09:00",
          },
        ],
      }),
      "Me"
    );

    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({
      title: "Follow up with design team",
      assignee: "Jason",
      priority: "High",
      reason: "Summarize the decision and unblock execution.",
    });
    expect(drafts[0].dueAt).toMatch(/^2026-03-12T/);
  });

  it("builds task payloads for current thread", () => {
    const payload = buildMyBotTaskPayload(
      {
        title: "Ship group summary",
        assignee: "Jason",
        priority: "Medium",
        dueAt: "2026-03-12T17:00:00.000Z",
        reason: "Send the follow-up before the meeting.",
      },
      {
        owner: "Jason",
        targetType: "group",
        targetId: "group_1",
        sourceThreadId: "group_1",
      }
    );

    expect(payload).toMatchObject({
      title: "Ship group summary",
      assignee: "Jason",
      priority: "Medium",
      targetType: "group",
      targetId: "group_1",
      sourceThreadId: "group_1",
      owner: "Jason",
    });
  });

  it("buckets reminder tasks by due date and filters unrelated threads", () => {
    const now = new Date("2026-03-10T12:00:00.000Z").getTime();
    const buckets = bucketMyBotReminderTasks(
      [
        {
          title: "Overdue",
          assignee: "Jason",
          priority: "High",
          status: "Pending",
          dueAt: "2026-03-10T11:00:00.000Z",
          sourceThreadId: "group_1",
        },
        {
          title: "Upcoming",
          assignee: "Jason",
          priority: "Medium",
          status: "Pending",
          dueAt: "2026-03-10T15:00:00.000Z",
          sourceThreadId: "group_1",
        },
        {
          title: "No due date",
          assignee: "Jason",
          priority: "Low",
          status: "Pending",
          sourceThreadId: "group_1",
        },
        {
          title: "Other thread",
          assignee: "Jason",
          priority: "Low",
          status: "Pending",
          dueAt: "2026-03-10T16:00:00.000Z",
          sourceThreadId: "group_2",
        },
      ],
      "group_1",
      now
    );

    expect(buckets.overdue.map((task) => task.title)).toEqual(["Overdue"]);
    expect(buckets.upcoming.map((task) => task.title)).toEqual(["Upcoming"]);
    expect(buckets.unscheduled.map((task) => task.title)).toEqual(["No due date"]);
  });
});
