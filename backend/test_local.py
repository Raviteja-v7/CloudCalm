import json

from lambda_function import lambda_handler


event = {
    "body": json.dumps({
        "incident": (
            "My application behind an AWS Application Load Balancer "
            "is returning HTTP 503 errors. I am new to AWS."
        ),
        "history": [],
    })
}

result = lambda_handler(event, None)

print("HTTP status:", result["statusCode"])
print("Agent response:")

print(json.dumps(
    json.loads(result["body"]),
    indent=2,
))