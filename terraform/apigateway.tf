# HTTP API — single POST route that Discord calls as the interactions
# endpoint for the /note slash command.
resource "aws_apigatewayv2_api" "discord" {
  name          = "${var.project_name}-discord"
  protocol_type = "HTTP"

  tags = {
    Name = "${var.project_name}-discord"
  }
}

resource "aws_apigatewayv2_integration" "discord_interaction" {
  api_id                 = aws_apigatewayv2_api.discord.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.discord_interaction.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "discord_interaction" {
  api_id    = aws_apigatewayv2_api.discord.id
  route_key = "POST /interactions"
  target    = "integrations/${aws_apigatewayv2_integration.discord_interaction.id}"
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.discord.id
  name        = "$default"
  auto_deploy = true
}
