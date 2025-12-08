# poc-portal
A status overview of all POCs


# Issues

- sometings wrong with the following CSS
      - toggle switch to show use cases... just a cehckbox.. should be a switch.. 
      - background of the use case specific ERs.. shoul be full colors... no idea what's causing this.. fck css..
      - there's a connenction between the ERs and the uce case table
      - the use case table does no have rounded corners.
      - colors are not good selection need some better color picking... 
      - login: email and username not vertially alinged
      - customer prep bar is to dominant.... 
      - "needs by" and PB TIMEFRAME are not horiyontaly allinged..
      - find a better visualizatzion as deal breaker..
      - botton corners of active use cases is round, bottom corner of In-Revew is straight corners...

- long comments are cut off, need some option to show the whole comment..

- show feature request button sometimes disapers.. need to refresh the browser

- filtering isn't working... needs to be done anyhow..

- PB timeframe not read at creation time

- PB timeframes are not updated

- ER does not use BP timeformat for timeframe

- SE names are not shown to others also not managers.. (it's because of permissions on the users table..)

- on POCs in review move the use cases table above the results of the poc

- comments not shown.... 

- ADD the product NAME to the POC :-() -- allow to filter for products somewhere..

# TODO

- track competitors

- remove hard coded key for testing from the public api..

- be able to click on use cases and be abele to check how this usecase was rated / feedback across all POCs... *everyone can view.... 

- show under use cases with the link if it's linked to some product board item.. probably just color the link item...

- ADD to the users a REGION so managers can filter by regions, not just by SEs... and later on AI will be able to filter..

- make sure feedback is shown... 

- apply the same to the  in review and closed use cases..

- make it possible to rotate API keys for the exposed API.

- move the insight button to the right corner of the frame, does not look good..

- update the dashboard..
    [Active POCs]    [in Recview]    [Closed (last 3 months)]
  
    [at risk]   [preparation at risk;] [open use cases (active POCs)] [completed use cases (active POCs)]

   [New feedback] [Delivery Risk (PB TIMELINE does not fit customer timeline / including closed POCs)]



- when linking a pb item, it does not update the 

- mske the importance selector show the following hints.
          1. Nice to Have
          Non-essential improvement. No roadmap commitment required. Suitable for general feedback, UX improvements, or long-term ideas.

          2. Roadmap Candidate
          Valid requirement that we intend to address in the future, but no commitment on timing. Product may schedule it based on broader strategy and capacity.

          3. Time-Sensitive Requirement
          Feature is commercially relevant and needs to be delivered within a defined timeframe, but does not block a deal. Requires coordination with Product for tentative or planned delivery timing.

          4. Critical Requirement
          High-impact requirement that affects deal success. Customer expects a clear delivery commitment within a specific timeframe. PM alignment required.

- needed by and timeframe are not at level... 

## Ideas

- make a report of missing timelines from PM for or deals for the current quarter which requier commitment. (or specific close date)

- deals at risk for the quater (poc close date closer than 5 weeks ot the quarter... also sonsider overdue pocs...)

- desing a workflow behind the escalation... makeing it possible to track dicssuions / or at least outcomes.. 

- make the timeframe use the actual json fromat from product board and upgrade to the new version.

- more statistics active POCs.... recently closed POCs...

- add an option to mark a POC as technical Win + Mark it if we also won it financially and they are now a customer.. \

- make notiifcations for SEs to review feedback.
- make a area where SEs can review their feedback from their POCs, and managers can see the feedback from all their SEs...

- notifiy via the browser if new feedback arrived, or a new use cases was markes as completed by a prospect

- change "How did you like this use case to 'Does the product address your needs, what could we improve?'" in the documentation..

- status update page on the POC doc container...

- product board...

- option to edit closed poc

- add option to add insights...

- add a daily hook or some task task to update PB deliver dates for each ER... 

- integrate with a ticket system and catch updates/ send feedback... option to escalate...would need ticket system of their choise btw..

- make a notification for customer feedback to review so when new feedback came it notifiy via a widget that there is feedback to review and make this to be ACKloedge by the SE and all managers that belong to this SE.. PM should see all feedback from all SEs as well see the "feedback to review".

Ses should have an option to ACK this feedback so it's makred as 'read' make something line moderns email clients... like if it's viewed for a few seconds make it read (actually read is better wording than ack).. and allow the SE to mark all feedback as read..




- STATISTICS / DASHBOARD options

  win/loss rate
  show use cases with most ERs
  show most demanded ERs


  Widgets:
  Active POCs (clickable)
  POCs in Review (clickable)
  Closed POCs (clickable)

  POCs at Risk
  

- enable to search in closed POCs.. that will probably take a while until this is necessary. hmm maybe it would make sense for Tony to find even active POCs faster... hmm


- AI QUESTIONS:

 how likley is it that we will win deal xzy?

 What have deals we win/loose in common?
 
 Is there a pattern if we win/loose deals
 
 Is there a difference between POCs in US and EMEA?

 Which Partners have the best/worst win rates

//// questions need to be not able to answer by regular sales tools like gong or salesforee...
