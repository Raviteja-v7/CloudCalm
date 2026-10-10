import json
import logging
import os
import re

import boto3
from botocore.exceptions import ClientError

logger = logging.getLogger()
logger.setLevel(logging.INFO)

AWS_REGION = os.environ.get("AWS_REGION", "us-east-1")
MODEL_ID = os.environ.get(
    "MODEL_ID",
    "us.amazon.nova-2-lite-v1:0",
)

bedrock = boto3.client(
    "bedrock-runtime",
    region_name=AWS_REGION,
)

SYSTEM_PROMPT = """
You are CloudCalm, a friendly and experienced AWS troubleshooting guide.

YOUR MISSION
Help developers diagnose AWS application problems through calm,
clear, evidence-based, interactive troubleshooting.

PERSONALITY
- Friendly, reassuring, and professional.
- Never blame the user.
- Explain AWS concepts in beginner-friendly language.
- Prefer practical steps over lengthy theory.
- Never overwhelm the user with too many actions.

TROUBLESHOOTING RULES
1. Identify the incident and summarize what is known.
2. Distinguish confirmed facts from possible causes.
3. Ask a clarifying question when essential information is missing.
4. Give ONE primary troubleshooting action at a time.
5. Explain where to find the relevant setting, metric, or log.
6. Explain what the possible results mean.
7. Ask the user to report what they observe before proceeding.
8. Never claim to have accessed the user's AWS account.
9. Never claim to have inspected logs, metrics, or resources unless
   the user has provided that information.
10. Never request AWS access keys, passwords, session tokens,
    or other credentials.
11. Do not recommend destructive actions as routine fixes.
12. Do not invent error messages, configuration values, or findings.

COMMON INCIDENTS
- ALB 503: target health, listener rules, target ports, security
  groups, application health checks, and application logs.
- Lambda timeout: execution duration, CloudWatch logs, downstream
  dependencies, network configuration, and timeout settings.
- S3 AccessDenied: IAM identity policies, bucket policies,
  explicit denies, resource ownership, and applicable access controls.

RESPONSE FORMAT
Return a valid JSON object with these fields:

{
  "message": "A concise, friendly explanation.",
  "step_title": "The title of the next action.",
  "step_description": "One practical action the user can take.",
  "choices": [
    {
      "label": "A possible observation",
      "value": "A short machine-readable value"
    }
  ],
  "status": "investigating"
}

The choices array should contain two to four useful options when
appropriate. Use an empty array if choices would not help.

The status must be one of:
- investigating
- likely_cause_identified
- more_information_needed

Only return the JSON object. Do not wrap it in Markdown fences.
"""


def response(status_code, body):
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": os.environ.get(
                "ALLOWED_ORIGIN", "*"
            ),
            "Access-Control-Allow-Headers": "Content-Type",
            "Access-Control-Allow-Methods": "OPTIONS,POST",
        },
        "body": json.dumps(body),
    }


def lambda_handler(event, context):
    try:
        if event.get("httpMethod") == "OPTIONS":
            return response(200, {"message": "OK"})

        raw_body = event.get("body")

        if isinstance(raw_body, str):
            data = json.loads(raw_body) if raw_body else {}
        elif isinstance(raw_body, dict):
            data = raw_body
        else:
            data = event if isinstance(event, dict) else {}

        incident = data.get("incident", "")
        history = data.get("history", [])

        if not isinstance(incident, str) or not incident.strip():
            return response(
                400,
                {"error": "Please describe the AWS issue you're facing."},
            )

        if len(incident) > 4000:
            return response(
                400,
                {"error": "Please keep the incident description under 4000 characters."},
            )

        if not isinstance(history, list) or len(history) > 12:
            return response(
                400,
                {"error": "Conversation history must contain at most 12 messages."},
            )

        messages = []

        for item in history:
            if not isinstance(item, dict):
                continue

            role = item.get("role")
            content = item.get("content")

            if role not in ("user", "assistant"):
                continue

            if not isinstance(content, str) or not content.strip():
                continue

            if len(content) > 4000:
                continue

            messages.append({
                "role": role,
                "content": [{"text": content}],
            })

        messages.append({
            "role": "user",
            "content": [{
                "text": (
                    "Help me troubleshoot this incident:\n"
                    + incident.strip()
                )
            }],
        })

        result = bedrock.converse(
            modelId=MODEL_ID,
            system=[{"text": SYSTEM_PROMPT}],
            messages=messages,
            inferenceConfig={
                "maxTokens": 700,
                "temperature": 0.3,
            },
        )

        model_text = result["output"]["message"]["content"][0]["text"].strip()

        # Handle JSON wrapped in Markdown code fences.
        cleaned_text = re.sub(
            r"^```(?:json)?\s*|\s*```$",
            "",
            model_text,
            flags=re.IGNORECASE,
).strip()

        try:
            agent_result = json.loads(cleaned_text)

            # Validate the response structure before returning it.
            required_fields = {
                "message",
                "step_title",
                "step_description",
                "choices",
                "status",
            }

            if not isinstance(agent_result, dict):
                raise ValueError("Agent response must be a JSON object.")

            if not required_fields.issubset(agent_result.keys()):
                raise ValueError("Agent response is missing required fields.")

            if not isinstance(agent_result["choices"], list):
                raise ValueError("Agent choices must be a list.")

            if agent_result["status"] not in {
                "investigating",
                "likely_cause_identified",
                "more_information_needed",
            }:
                raise ValueError("Agent returned an invalid status.")

        except (json.JSONDecodeError, ValueError) as exc:
            logger.warning("Could not parse agent response: %s", exc)

            agent_result = {
                "message": (
                    "I received a response, but couldn't format it correctly. "
                    "Let's try that again."
                ),
                "step_title": "Retry troubleshooting",
                "step_description": (
                    "Please retry your request so I can provide the next step."
                ),
                "choices": [],
                "status": "investigating",
            }

        return response(200, agent_result)

    except json.JSONDecodeError:
        return response(400, {"error": "The request body contains invalid JSON."})

    except ClientError as exc:
        error = exc.response.get("Error", {})
        error_code = error.get("Code", "Unknown")
        error_message = error.get("Message", "No error message provided")
        request_id = getattr(context, "aws_request_id", "local")

        logger.error(
            "Bedrock request failed. Code=%s Message=%s RequestId=%s",
            error_code,
            error_message,
            request_id,
        )

        return response(502, {
            "error": "CloudCalm couldn't reach its AI service. Please try again shortly."
        })

    except Exception:
        logger.exception("Unexpected CloudCalm backend error.")

        return response(
            500,
            {"error": "Something went wrong. Please try again."},
        )