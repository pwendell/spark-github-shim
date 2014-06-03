var titleTemplate = _.template(
  "<tr>" +
      "<th>Links</th>" +
      "<th>Title</th>" +
      "<th>User</th>" +
      "<th>Updated</th>" +
  "</tr>");

var rowTemplate = _.template(
  "<tr>" +
    "<td><%= links %></td>" +
    "<td><%= pr.title %></td>" +
    "<td><%= pr.user.login %></td>" +
    "<td sorttable_customkey='<%= updated_stamp %>'><%= updated_str %></td>" +
  "</tr>");

var gitApiToken = "d273f68038f65e248c87c26bebb910e1eba74a2b"

$(document).ready(function() {
  _.each($("table"), function(t) { $(t).append(titleTemplate()) });
  render();
  fetchPRList();
});

function fetchPrPage(pageNum) {
  $.ajax({
    url: "https://api.github.com/repos/apache/spark/pulls?per_page=100&page=" + pageNum,
    success: function(data, status) {
      _.each(data, function(pr) {
        localStorage["pr_" + pr.id] = JSON.stringify(pr)
      });
      render();
    },
    error: function(data) {
      alert(data);
    },
    beforeSend: function(xhr) {
      xhr.setRequestHeader("Authorization", "Basic " + btoa(gitApiToken + ":x-oauth-basic"));
    }
  });
}

// Kick off an asynchronous fetch of PR data from github.
function fetchPRList() {
  fetchPrPage(1);
  fetchPrPage(2);
  fetchPrPage(3);
  fetchPrPage(4);
};

function createRow(pr) {
  var linksTemplate = _.template(
    "[<a href='<%= github_pr_url %>/<%= pr_num %>'>conversation</a>]" +
    "[<a href='<%= github_pr_url %>/<%= pr_num %>/files'>files</a>]" +
    "<% if (jira_id != null) { %>" +
    "[<a href='<%= jira_url %>/<%= jira_id %>'>JIRA</a>]" +
    "<% } %>");


  var jiraRegex = pr.title.match(/SPARK-\d+/);
  var jiraId = jiraRegex == null ? null : jiraRegex[0];

  var links = linksTemplate({
    github_pr_url: "https://github.com/apache/spark/pull",
    jira_url: "https://issues.apache.org/jira/browse",
    pr_num: pr.number,
    jira_id: jiraId});


  return rowTemplate({
    "pr": pr,
    updated_str: $.timeago(new Date(pr.updated_at)),
    updated_stamp: new Date(pr.updated_at).getTime(),
    links: links});
};

function addPRToTable(json) {
  if (json.title.search(/SQL/i) >= 0) {
    $("#sql-table").append(createRow(json));
  }
  else if (json.title.search(/MLLIB/i) >= 0) {
    $("#mllib-table").append(createRow(json));
  }
  else if (json.title.search(/GRAPHX/i) >= 0) {
    $("#graphx-table").append(createRow(json));
  } else if (json.title.search(/STREAMING/i) >= 0) {
    $("#streaming-table").append(createRow(json));
  } else {
    $("#core-table").append(createRow(json));
  }
};

// Re-render the list of fetched PR's. Idempotent.
function render() {
  _.each($("table"), function(t) { $(t).empty() });
  _.each($("table"), function(t) { $(t).append(titleTemplate()) });

  var prKeys = _.filter(_.keys(localStorage), function(k) { return k.indexOf("pr_") == 0 });
  var prTuples = _.map(prKeys, function(k) { return [k, JSON.parse(localStorage[k])] });

  // Default sort based on updated date
  prTuples.sort(function (a, b) {
    if (a[1].updated_at > b[1].updated_at) { return 1 }
    if (a[1].updated_at < b[1].updated_at) { return -1 }
    return 0
  }).reverse();

  _.each(prTuples, function (tuple) {
    addPRToTable(tuple[1]);
  });

  _.each($("table"), function(t) {
    sorttable.makeSortable(t);

    // Hack to make it clear the columns are sortable
    var updated = $(t).find("th").filter(function(idx, th) { return $(th).html() == "Updated"; })
    $(updated).append("<span id='sorttable_sortfwdind'>&nbsp;&#9662;</span>");
  });
};