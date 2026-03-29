# Classification System

## Goal  
  
Classify how an article frames a topic, not whether it is true or false.  
  
---  
  
## Important Concept  
  
Classification is always relative to a topic or claim.  
  
Do NOT classify articles in isolation.  
  
---  
  
## Internal Categories  
  
- support  
- challenge  
- report_only  
- mixed  
- unclear  
  
---  
  
## Definitions  
  
### support  
Article supports or reinforces the topic claim.  
  
### challenge  
Article questions, criticizes, or opposes the claim.  
  
### report_only  
Article presents facts without taking a clear stance.  
  
### mixed  
Contains both supporting and opposing elements.  
  
### unclear  
No clear stance or insufficient signal.  
  
---  
  
## Rules  
  
- Do NOT force classification  
- If uncertain   uc0  u8594  unclear  
- If both sides present   uc0  u8594  mixed  
  
---  
  
## Required Output  
  
Each classification must include:  
  
- stance  
- reason (1 sentence)  
- confidence (0-1 or low/medium/high)  
  
---  
  
## Example  
  
Input:  
"AI regulation debate intensifies..."  
  
Output:  
- stance: support  
- reason: emphasizes need for stronger regulation  
- confidence: medium  
  
---  
  
## Important Notes  
  
- Classification is probabilistic  
- Never present as absolute truth  
- Always allow ambiguity}

## Language Requirement

- All classification outputs must be written in natural Japanese
- Avoid direct translation artifacts
- Reason should be concise and easy to understand for Japanese users
