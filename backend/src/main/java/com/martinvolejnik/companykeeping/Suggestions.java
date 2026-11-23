package com.martinvolejnik.companykeeping;

import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

final class Suggestions {
    private Suggestions() {}
    static final Map<String,Object> EXAMPLE = Map.of("name","For General Use","country","Czechia",
            "description","For General Use is the software company behind Companykeeping. We’re also preparing to launch Stillpoint.","stage","operating");

    static Map<String,Object> example() { return Map.of("workspace",EXAMPLE,"suggestions",forProfile(EXAMPLE,true)); }

    private static Map<String,Object> item(String title, String why, String action) {
        var item = new HashMap<String,Object>();
        item.put("title", title);
        item.put("why", why);
        item.put("nextAction", action);
        item.put("status", "ready");
        item.put("waitingFor", "");
        item.put("recurrence", "none");
        item.put("dueDate", null);
        item.put("followUpDate", null);
        item.put("evidenceUrl", "");
        item.put("sourceUrl", "");
        return item;
    }

    static List<Map<String,Object>> forProfile(Map<String,Object> workspace, boolean demo) {
        var monthly = item("Send monthly records to the bookkeeper",
                "A regular handover keeps invoices, receipts and statements together and leaves a record of what you sent.",
                "Gather this month’s receipts and statements. Confirm the handover date with your bookkeeper.");
        monthly.put("recurrence","monthly");
        if ("forming".equals(workspace.get("stage"))) {
            return List.of(
                item("Write down the first offer", "A short description helps you explain the business to a first customer or adviser.",
                        "Start from your description, “" + workspace.get("description") + "”. Note who would buy it and what you would deliver."),
                item("Check the local setup steps", "An official source or local adviser can clarify which steps apply to your business.",
                        "Find the relevant business guidance for " + workspace.get("country") + " and save its link. Add the steps and dates it confirms."),
                item("Choose where to keep company records", "A shared home for correspondence, confirmations and receipts keeps early decisions easy to find.",
                        "Choose a document folder and save a link to it."),
                item("Plan the first bookkeeping conversation", "A first conversation can establish what records to keep and when your adviser wants them.",
                        "Write down your questions and choose whom to ask."));
        }
        if (demo) {
            var waiting = item("Confirm the studio’s bookkeeping handover", "An agreed handover format makes the first monthly close easier to repeat.",
                    "Save the bookkeeper’s reply and update the monthly records item.");
            waiting.put("status","waiting");
            waiting.put("waitingFor","the bookkeeper’s preferred format");
            waiting.put("followUpDate",LocalDate.now().plusDays(2).toString());
            monthly.put("dueDate",LocalDate.now().plusDays(3).toString());
            return List.of(
                item("Review the Stillpoint launch checklist", "The studio needs an agreed list of open decisions before it can set a launch date.",
                        "Read the latest product notes and pick the next release decision."),
                waiting, monthly,
                item("File the latest studio invoice", "Keeping the invoice with its source makes it easier to find at the next handover.",
                        "Add the invoice link and record where the original is filed."));
        }
        return List.of(monthly,
            item("Review invoices awaiting payment", "A short review helps you see which customer payments still need attention.",
                    "Open the invoice list and note the next person to follow up with."),
            item("Record the next confirmed deadline","A date is easier to act on when you can return to the person or source that confirmed it.",
                    "Check a date with your accountant or an official source in " + workspace.get("country") + ". Save the date and source together."),
            item("Organize the company records", "A consistent home for documents makes the next request easier to answer.",
                    "Gather the latest agreements and confirmations and link to the folder."));
    }
}
